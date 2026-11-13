import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subjectCatalogService, SUBJECT_CATALOG_STORAGE_KEY } from "./subjectCatalogStore";
import { getAcademicSubjectByName, getJournalHref, readSubjectCatalogDocument, refreshAcademicCatalog } from "./academicCatalog";
import { accountService, ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument } from "./accountStore";
import { ASSESSMENTS_STORAGE_KEY } from "../domain/assessmentTypes";
import { MANAGED_SCHEDULE_KEY } from "../domain/scheduleManagement";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";
import { assessmentCorrectionFixture } from "../testSupport/assessmentCorrections";

let values: Map<string, string>;
const actor = { actorId: "configurator-demo", actorRevision: 1 };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-13T09:00:00Z")); values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {}); vi.spyOn(console, "error").mockImplementation(() => undefined); refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const setup = async () => {
  const subject = await subjectCatalogService.create({ ...actor, expectedRevision: 0, draft: { name: "Новый предмет", shortName: "НП" } });
  const command = { ...actor, expectedRevision: 1, subjectId: subject.id, subjectRevision: 1 };
  return { subject, command };
};
describe("subject editing and archive service", () => {
  it("preserves the ID, resolves old names and old journal links after editing", async () => {
    const { subject, command } = await setup(), journal = getJournalHref(subject.name, "112-МКо"); values.set("bi-university-private-fixture", "unchanged");
    const changed = await subjectCatalogService.update({ ...command, draft: { name: "Переименованный предмет", shortName: "ПП" } });
    expect(changed.id).toBe(subject.id); expect(getAcademicSubjectByName(subject.name)?.id).toBe(subject.id); expect(getJournalHref(subject.name, "112-МКо")).toBe(journal);
    expect(values.get("bi-university-private-fixture")).toBe("unchanged"); expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false);
  });
  it("archives only after a dependency preview and prevents new assignments until restoration", async () => {
    const { subject, command } = await setup(), preview = await subjectCatalogService.previewStatus(command);
    expect(preview.blockers).toEqual([]);
    await subjectCatalogService.changeStatus({ ...preview, status: "archived" });
    const memberships = [{ subjectId: subject.id, groupIds: ["112-mko"] }];
    await expect(accountService.updateAssignments({ ...actor, expectedRevision: 0, accountId: "teacher-elena-volkova", accountRevision: 1, memberships })).rejects.toThrow("Архивная дисциплина");
    expect(readSubjectCatalogDocument().subjects.find(row => row.id === subject.id)?.status).toBe("archived");
    const restore = await subjectCatalogService.previewStatus({ ...command, expectedRevision: 2, subjectRevision: 2 }); await subjectCatalogService.changeStatus({ ...restore, status: "active" });
    await expect(accountService.updateAssignments({ ...actor, expectedRevision: 0, accountId: "teacher-elena-volkova", accountRevision: 1, memberships })).resolves.toBeDefined();
  });
  it("fails closed when the assessment dependency source is damaged", async () => {
    const { command } = await setup(), before = values.get(SUBJECT_CATALOG_STORAGE_KEY); values.set(ASSESSMENTS_STORAGE_KEY, "damaged");
    await expect(subjectCatalogService.previewStatus(command)).rejects.toThrow(); expect(values.get(SUBJECT_CATALOG_STORAGE_KEY)).toBe(before); expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe("damaged");
  });
  it("rejects stale confirmation when the account document changed", async () => {
    const { command } = await setup(), preview = await subjectCatalogService.previewStatus(command), accounts = createInitialAccountsDocument(); accounts.revision++;
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    await expect(subjectCatalogService.changeStatus({ ...preview, status: "archived" })).rejects.toThrow("изменились");
  });
  it.each(["draft", "future-published"])("blocks archive for a %s lesson and rechecks schedule revisions", async mode => {
    const { subject, command } = await setup(), source = coreBackupFixture().schedule;
    const lesson = { ...source.drafts[0].lessons[0], subjectId: subject.id, date: "2026-11-14" }, week = { weekStart: "2026-11-09", groupId: lesson.groupId, lessons: [lesson] };
    const schedule = { version: 1, revision: 1, drafts: mode === "draft" ? [week] : [], published: mode === "future-published" ? [week] : [], journal: mode === "future-published" ? [{ ...lesson, journalState: "active" }] : [] };
    values.set(MANAGED_SCHEDULE_KEY, JSON.stringify(schedule));
    const preview = await subjectCatalogService.previewStatus(command); expect(preview.blockers).toHaveLength(1);
    await expect(subjectCatalogService.changeStatus({ ...preview, status: "archived" })).rejects.toThrow(mode === "draft" ? "черновиках" : "Будущие");
    values.set(MANAGED_SCHEDULE_KEY, JSON.stringify({ ...schedule, revision: 2, drafts: [], published: [], journal: [] }));
    await expect(subjectCatalogService.changeStatus({ ...preview, status: "archived" })).rejects.toThrow("изменились");
  });
  it("blocks archive for a draft correction and rechecks assessment revision before writing", async () => {
    const { subject, command } = await setup(), fixture = assessmentCorrectionFixture(), state = fixture.open(); state.assessments[0].subjectId = subject.id;
    values.set(ASSESSMENTS_STORAGE_KEY, JSON.stringify(state)); const preview = await subjectCatalogService.previewStatus(command);
    expect(preview.dependencies.unfinishedAssessments).toBe(1); await expect(subjectCatalogService.changeStatus({ ...preview, status: "archived" })).rejects.toThrow("Незавершённые");
    const published = fixture.publish(fixture.save(state)); values.set(ASSESSMENTS_STORAGE_KEY, JSON.stringify(published));
    await expect(subjectCatalogService.changeStatus({ ...preview, status: "archived" })).rejects.toThrow("изменились");
    const fresh = await subjectCatalogService.previewStatus(command); expect(fresh.dependencies.unfinishedAssessments).toBe(0); await expect(subjectCatalogService.changeStatus({ ...fresh, status: "archived" })).resolves.toMatchObject({ status: "archived" });
    expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe(JSON.stringify(published));
  });
  it.each(["archive-first", "assignment-first"])("serializes assignment and archive races: %s", async mode => {
    const { subject, command } = await setup(), preview = await subjectCatalogService.previewStatus(command);
    const archive = () => subjectCatalogService.changeStatus({ ...preview, status: "archived" });
    const assign = () => accountService.updateAssignments({ ...actor, expectedRevision: 0, accountId: "teacher-elena-volkova", accountRevision: 1, memberships: [{ subjectId: subject.id, groupIds: ["112-mko"] }] });
    const results = await Promise.allSettled(mode === "archive-first" ? [archive(), assign()] : [assign(), archive()]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1); expect(results.filter(row => row.status === "rejected")).toHaveLength(1);
  });
  it("returns bounded history pages with snapshots and no storage writes", async () => {
    const { subject } = await setup();
    for (let index = 1; index <= 22; index++) await subjectCatalogService.update({ ...actor, expectedRevision: index, subjectId: subject.id, subjectRevision: index, draft: { name: `Предмет ${index}`, shortName: "НП" } });
    const command = { ...actor, expectedRevision: 23, subjectId: subject.id, subjectRevision: 23 }, before = JSON.stringify([...values]);
    expect(await subjectCatalogService.history({ ...command, page: 1 })).toMatchObject({ total: 23, page: 1, pages: 2 }); expect((await subjectCatalogService.history({ ...command, page: 1 })).items).toHaveLength(20);
    expect((await subjectCatalogService.history({ ...command, page: 2 })).items).toHaveLength(3); expect(JSON.stringify([...values])).toBe(before);
    await expect(subjectCatalogService.history({ ...command, actorId: "anna-smirnova", page: 1 })).rejects.toThrow("настройщику");
  });
});
