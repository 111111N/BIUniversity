import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKUP_DATABASES, BACKUP_LIMITS, type RawBackupDatabase } from "../domain/localBackup";
import { backupFixture, backupTime, rawBackupDatabase } from "../testSupport/localBackup";
import { createLocalBackupService, type BackupDependencies } from "./localBackupService";
import { createBackupInspectionService } from "./localBackupInspectionService";
import { coreBackupFixture, scheduleConflictBackupFixture, materialBackupFixture, materialIndexBackupFixture, learningBackupFixture, learningFileBackupFixture, journalBackupFixture, plannerBackupFixture, notificationBackupFixture, notificationTargetBackupFixture, settingsBackupFixture, messagingBackupFixture, messagingReplyBackupFixture, messageFileBackupFixture, replaceMessageFileBlob } from "../testSupport/localBackupDocuments";
import { prepareBackupInspectionReport } from "./localBackupInspectionReport";

const command = { actorId: "configurator-demo", actorRevision: 1 };
const setup = () => {
  const values = new Map([["bi-university-theme", "light"], ["bi-university-demo-account", "configurator-demo"]]);
  const databases = new Map<string, RawBackupDatabase>();
  const authorize = vi.fn();
  const listDatabases = vi.fn(async () => [...databases.values()].map(({ name, version }) => ({ name, version: version ?? undefined })));
  const readDatabase = vi.fn(async (name: string) => databases.get(name)!);
  const dependencies: BackupDependencies = {
    storage: { get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null, getItem: (key) => values.get(key) ?? null },
    authorize, listDatabases, readDatabase, origin: "https://portal.example", basePath: "/BIUniversity/",
  };
  const exportFile = async () => { const result = await createLocalBackupService(dependencies).exportAdministrative(command); return new File([result.blob], "archive.json", { type: "application/json" }); };
  return { values, databases, authorize, readDatabase, listDatabases, dependencies, exportFile, service: createBackupInspectionService(dependencies) };
};
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(backupTime); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("read-only backup inspection", () => {
  it.each(["код", "\\u0061"])("exports Unicode compound unique-index collisions after 200 without private values or mutations: %s", async (field) => {
    const state = setup(); const fixture = await materialIndexBackupFixture(); const original = fixture.records[0];
    fixture.archive.databases[0].stores[0].indexes[1].keyPath = [`реквизиты.${field}`, "scope"];
    if (original.value.type !== "object") throw new Error("Expected material object");
    original.value.entries.push(["реквизиты", { type: "object", entries: [[field, { type: "string", value: "PRIVATE" }]] }]);
    fixture.records.splice(0, 2, ...Array.from({ length: 206 }, (_, index) => {
      const record = structuredClone(original); const id = `material-${index}`; record.key = { type: "string", value: id };
      if (record.value.type !== "object") throw new Error("Expected material object"); record.value.entries.find(([key]) => key === "id")![1] = { type: "string", value: id }; return record;
    }));
    fixture.archive.totals.databaseRecords = 206; fixture.archive.totals.files = 206; fixture.archive.totals.binaryBytes = fixture.file.size * 206;
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "file-indexes.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 5, invalid: 0, errors: 205, reviews: 1 });
    const conflicts = saved.documents.issues.filter((issue: { code: string }) => issue.code === "file-unique-index-conflict"); expect(conflicts).toHaveLength(205);
    expect(conflicts.at(-1)).toMatchObject({ kind: "materials", referenceId: "bi-university-cabinet/teacher-files", recordId: JSON.stringify(["index", "by-name", "material-0", "material-205"]) });
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("base64");
    expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports every unresolved notification target after 200 without private URLs or changes to source data", async () => {
    const state = setup(); const fixture = notificationTargetBackupFixture(); const notice = fixture.notifications[0];
    fixture.notifications.splice(0, 1, ...Array.from({ length: 205 }, (_, index) => ({ ...notice, id: `notice-${index}`, href: `/journal/subject-1/group-1?assignment=PRIVATE-${index}` }))); fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "notification-targets.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 10, invalid: 0, errors: 0, reviews: 205 });
    expect(saved.documents.issues).toHaveLength(205); expect(saved.documents.issues.at(-1)).toMatchObject({ kind: "notifications", level: "review", code: "missing-notification-assignment", recordId: "notice-204" });
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("assignment=");
    expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports all unresolved journal-area targets without their URLs or substituting browser catalogs", async () => {
    const state = setup(); const fixture = notificationTargetBackupFixture(); const notice = fixture.notifications[0];
    fixture.notifications.splice(0, 1, ...Array.from({ length: 205 }, (_, index) => ({ ...notice, id: `notice-${index}`, href: `/journal/subject-1/PRIVATE-${index}?tab=journal` }))); fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "journal-area-targets.json") });
    const file = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await file.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 10, invalid: 0, errors: 0, reviews: 205 });
    expect(saved.documents.issues).toHaveLength(205); expect(saved.documents.issues.at(-1)).toMatchObject({ kind: "notifications", code: "missing-notification-target-area", recordId: "notice-204" });
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("tab=journal");
    expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports all 900 typed schedule conflicts with technical IDs and preserves archived and live data", async () => {
    const state = setup(); const fixture = scheduleConflictBackupFixture();
    const lessons = Array.from({ length: 25 }, (_, index) => ({ ...fixture.first, id: `managed:lesson-${index}`, scheduleId: index + 1 }));
    fixture.schedule.published[0].lessons = lessons; fixture.schedule.journal = lessons.map((lesson) => ({ ...lesson, journalState: "active" as const }));
    fixture.save(); const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "schedule-conflicts.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 4, invalid: 0, errors: 900, reviews: 0 });
    expect(saved.documents.issues).toHaveLength(900);
    for (const kind of ["teacher", "group", "room"]) expect(saved.documents.issues.filter((issue: { code: string }) => issue.code === `published-schedule-conflict-${kind}`)).toHaveLength(300);
    expect(saved.documents.issues).toContainEqual(expect.objectContaining({ kind: "schedule", referenceId: "bi-university-managed-schedule-v1", recordId: JSON.stringify(["published", "managed:lesson-0", "managed:lesson-24"]) }));
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports every archived-group student conflict beyond 200 without exposing names or changing data", async () => {
    const state = setup(); const fixture = coreBackupFixture(); fixture.groups.groups[0].status = "archived";
    fixture.groups.groups[0].name = "PRIVATE GROUP"; fixture.accounts.accounts[1].memberships.length = 0;
    fixture.schedule.drafts[0].lessons.length = 0; const student = fixture.accounts.accounts.pop()!;
    fixture.accounts.accounts.push(...Array.from({ length: 205 }, (_, index) => ({ ...student, id: `student-${index}`, login: `student-${index}`, name: "PRIVATE NAME" })));
    fixture.save(); const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "group-states.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 4, invalid: 0, errors: 205, reviews: 0 });
    expect(saved.documents.issues).toHaveLength(205);
    expect(saved.documents.issues.at(-1)).toMatchObject({ kind: "groups", level: "error", code: "archived-group-student", referenceId: "group-1", recordId: JSON.stringify(["student", "student-204"]) });
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports material metadata conflicts with technical IDs and preserves archived and live data", async () => {
    const state = setup(); const fixture = await materialBackupFixture(); const row = fixture.records[0].value;
    if (row.type !== "object") throw new Error("Expected material"); row.entries.find(([key]) => key === "name")![1] = { type: "string", value: "PRIVATE CONFLICT" };
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "materials.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 5, invalid: 0, errors: 1, reviews: 0 });
    expect(saved.documents.issues).toEqual([expect.objectContaining({ kind: "materials", code: "material-blob-mismatch", referenceId: "bi-university-cabinet/teacher-files", recordId: "material-1" })]);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("base64"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("retains material owner findings beyond 200 in the complete JSON report", async () => {
    const state = setup(); const fixture = await materialBackupFixture(); const original = fixture.records[0].value;
    if (original.type !== "object") throw new Error("Expected material");
    fixture.records.splice(0, 1, ...Array.from({ length: 205 }, (_, index) => ({ key: { type: "string" as const, value: `material-${index}` }, value: { type: "object" as const, entries: original.entries.map(([key, value]): [string, typeof value] => [key, key === "id" ? { type: "string", value: `material-${index}` } : key === "scope" ? { type: "string", value: "user:missing-owner" } : value]) } })));
    fixture.archive.totals.databaseRecords = 205; fixture.archive.totals.files = 205; fixture.archive.totals.binaryBytes = fixture.file.size * 205;
    const before = JSON.stringify(fixture.archive); const inspection = await state.service.inspect({ ...command, file: new File([before], "many-materials.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.issues).toHaveLength(205); expect(saved.documents.issues.at(-1)).toMatchObject({ code: "missing-material-owner", recordId: "material-204" });
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("base64"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });
  it("exports a learning-file name conflict with technical IDs and no names, bytes or source mutations", async () => {
    const state = setup(); const fixture = await learningFileBackupFixture(); fixture.assignments[0].attachmentName = "PRIVATE CONFLICT.txt"; fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "learning-files.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 6, invalid: 0, errors: 1, reviews: 0 });
    expect(saved.documents.issues).toEqual([expect.objectContaining({ kind: "assignments", code: "learning-attachment-name-mismatch", referenceId: "bi-university-demo-assignments", recordId: JSON.stringify(["assignment", "task-1", "task-file"]) })]);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("base64");
    expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("keeps all missing learning-file references beyond 200 in the complete JSON report", async () => {
    const state = setup(); const fixture = await learningFileBackupFixture(); const original = fixture.assignments[0];
    fixture.assignments.splice(0, 1, ...Array.from({ length: 205 }, (_, index) => ({ ...original, id: `task-${index}`, attachmentId: `missing-file-${index}` }))); fixture.save();
    const before = JSON.stringify(fixture.archive); const inspection = await state.service.inspect({ ...command, file: new File([before], "many-learning-files.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    const missing = saved.documents.issues.filter((issue: { code: string }) => issue.code === "missing-learning-attachment");
    expect(missing).toHaveLength(205); expect(missing.at(-1).recordId).toBe(JSON.stringify(["assignment", "task-204", "missing-file-204"]));
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("base64"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });
  it("exports captured actor-context conflicts as review without declaring authorization or changing any data", async () => {
    const state = setup(); const fixture = journalBackupFixture(); fixture.changes[0].actor.role = "student"; fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "journal-actor-context.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 8, invalid: 0, errors: 0, reviews: 1 });
    expect(saved.documents.issues).toEqual([expect.objectContaining({ kind: "journalHistory", level: "review", code: "conflicting-journal-actor-context", referenceId: fixture.historyKey, recordId: "change-1" })]);
    expect(saved.documents.issues[0].message).toContain("это не доказательство неправомерного изменения");
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports missing historical journal actors without exposing names or changing archived and live data", async () => {
    const state = setup(); const fixture = journalBackupFixture(); fixture.changes[0].actor.id = "old-teacher"; fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "journal-people.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 8, invalid: 0, errors: 0, reviews: 1 });
    expect(saved.documents.issues).toEqual([expect.objectContaining({ kind: "journalHistory", code: "missing-journal-actor-account", referenceId: fixture.historyKey, recordId: "change-1" })]);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports draft-only journal lesson findings with technical references and preserves archived and live data", async () => {
    const state = setup(); const fixture = journalBackupFixture(); fixture.schedule.journal.length = 0; fixture.schedule.published.length = 0; fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "journal-lessons.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 8, invalid: 0, errors: 0, reviews: 2 });
    expect(saved.documents.issues).toEqual([
      expect.objectContaining({ kind: "journals", code: "draft-only-journal-lesson", referenceId: fixture.journalKey, recordId: JSON.stringify(["student-1", "managed:lesson-1"]) }),
      expect.objectContaining({ kind: "journalHistory", code: "draft-only-journal-lesson", referenceId: fixture.historyKey, recordId: "change-1" }),
    ]);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports unresolved journal-area keys without guessing references or changing archived and live data", async () => {
    const state = setup(); const fixture = journalBackupFixture();
    for (const entry of fixture.archive.localStorage) if (entry.key === fixture.journalKey || entry.key === fixture.historyKey) entry.key += ":unknown";
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "journal-areas.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 8, invalid: 0, errors: 0, reviews: 2 });
    expect(saved.documents.issues).toEqual([
      expect.objectContaining({ kind: "journals", code: "unresolved-journal-area", level: "review", referenceId: `${fixture.journalKey}:unknown` }),
      expect.objectContaining({ kind: "journalHistory", code: "unresolved-journal-area", level: "review", referenceId: `${fixture.historyKey}:unknown` }),
    ]);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports a journal snapshot conflict without choosing a value or touching archived and live data", async () => {
    const state = setup(); const fixture = journalBackupFixture(); fixture.students[0].attendance["managed:lesson-1"] = "sick"; fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const inspection = await state.service.inspect({ ...command, file: new File([before], "journal-snapshot.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 8, invalid: 0, errors: 0, reviews: 1 });
    expect(saved.documents.issues).toEqual([expect.objectContaining({ kind: "journalHistory", code: "journal-history-snapshot-mismatch", referenceId: fixture.historyKey, recordId: "change-1" })]);
    expect(saved.documents.checks.find((check: { kind: string }) => check.kind === "journalHistory").message).toContain("Сверено последних применимых изменений с ячейками архивных журналов: 1; не удалось сверить: 0");
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("sick"); expect(JSON.stringify(saved)).not.toContain("present");
    expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports a retained-history gap as review without choosing values from the live journal", async () => {
    const state = setup(); const fixture = journalBackupFixture(); const original = fixture.changes[0];
    fixture.changes.splice(0, 1, { ...original, id: "change-new", previousValue: "sick", nextValue: "present" }, { ...original, id: "change-old", previousValue: "unmarked", nextValue: "absent" }); fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const report = await state.service.inspect({ ...command, file: new File([before], "history-chain.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 8, invalid: 0, errors: 0, reviews: 1 });
    expect(saved.documents.issues).toEqual([expect.objectContaining({ kind: "journalHistory", code: "disconnected-journal-history", referenceId: fixture.historyKey, recordId: "change-new" })]);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("sick"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports a history-value error without historical names, cell values or changes to live data", async () => {
    const state = setup(); const fixture = journalBackupFixture(); fixture.changes[0].field = "grade"; fixture.changes[0].previousValue = null; fixture.changes[0].nextValue = "PRIVATE INVALID GRADE"; fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const report = await state.service.inspect({ ...command, file: new File([before], "history-values.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 8, invalid: 0, errors: 1, reviews: 0 });
    expect(saved.documents.issues).toEqual([expect.objectContaining({ kind: "journalHistory", code: "invalid-history-values", referenceId: fixture.historyKey, recordId: "change-1" })]);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports a conflicting content pair without binary data, names or edits to source files", async () => {
    const state = setup(); const fixture = await messageFileBackupFixture();
    await replaceMessageFileBlob(fixture.records[1], new File(["PRIVATE FILE BODX"], fixture.peerAttachment.name, { type: fixture.peerAttachment.type }));
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const report = await state.service.inspect({ ...command, file: new File([before], "message-file-content.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 12, invalid: 0, errors: 1, reviews: 0 });
    expect(saved.documents.issues).toEqual([expect.objectContaining({ code: "message-attachment-content-mismatch", referenceId: fixture.messagingKey, recordId: JSON.stringify(["bi-university-messages-v2:student:student-1", "teacher-1", 1, "own-file"]) })]);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("base64"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports an attachment ownership conflict without file contents or names, preserving the archive", async () => {
    const state = setup(); const fixture = await messageFileBackupFixture(); const value = fixture.records[0].value;
    if (value.type !== "object") throw new Error("Missing file fixture");
    value.entries.find(([key]) => key === "scope")![1] = { type: "string", value: "student:another-owner:teacher-1" };
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const report = await state.service.inspect({ ...command, file: new File([before], "message-files.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize); const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 12, invalid: 0, errors: 1, reviews: 0 });
    expect(saved.documents.issues).toEqual([expect.objectContaining({ kind: "messaging", code: "message-attachment-scope-mismatch", referenceId: fixture.messagingKey, recordId: JSON.stringify(["bi-university-messages-v2:student:student-1", "teacher-1", 1, "own-file"]) })]);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("base64"); expect(JSON.stringify(saved)).not.toContain("another-owner");
    expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports cyclic reply-chain findings with exact record IDs without touching archived or live messages", async () => {
    const state = setup(); const fixture = messagingReplyBackupFixture();
    Object.assign(fixture.messaging.users["bi-university-messages-v2:student:student-1"].messages["teacher-1"][0], { replyTo: 3 });
    Object.assign(fixture.messaging.users["bi-university-messages-v2:teacher:teacher-1"].messages["student-1"][0], { replyTo: 3 }); fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const report = await state.service.inspect({ ...command, file: new File([before], "reply-chains.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize);
    const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 12, invalid: 0, errors: 2, reviews: 0 });
    for (const mailbox of ["bi-university-messages-v2:student:student-1", "bi-university-messages-v2:teacher:teacher-1"]) expect(saved.documents.issues).toContainEqual(expect.objectContaining({ code: "cyclic-message-replies", referenceId: fixture.messagingKey, recordId: JSON.stringify([mailbox, mailbox.includes(":student:") ? "teacher-1" : "student-1", 1]) }));
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("exports a reply-source conflict without message contents or changes to archived or live data", async () => {
    const state = setup(); const fixture = messagingReplyBackupFixture(); fixture.peerReply.replyTo = 2; fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const report = await state.service.inspect({ ...command, file: new File([before], "reply-links.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize);
    const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 12, invalid: 0, errors: 1, reviews: 0 });
    expect(saved.documents.issues).toEqual([expect.objectContaining({ kind: "messaging", code: "message-copy-mismatch", referenceId: fixture.messagingKey, recordId: JSON.stringify(["bi-university-messages-v2:student:student-1", "teacher-1", 3]), message: expect.stringContaining("ссылка ответа") })]);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("includes a single copy conflict per delivery without revealing either message in the complete report", async () => {
    const state = setup(); const fixture = messagingBackupFixture();
    fixture.messaging.users["bi-university-messages-v2:teacher:teacher-1"].messages["student-1"][0].text = "PRIVATE CONFLICTING MESSAGE"; fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const report = await state.service.inspect({ ...command, file: new File([before], "delivery.json") });
    const result = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize);
    const saved = JSON.parse(await result.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 12, invalid: 0, errors: 1, reviews: 0 });
    expect(saved.documents.issues).toEqual([expect.objectContaining({ kind: "messaging", code: "message-copy-mismatch", referenceId: fixture.messagingKey, recordId: JSON.stringify(["bi-university-messages-v2:student:student-1", "teacher-1", 1]) })]);
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("includes mailbox findings in the full report without messages, names or source documents", async () => {
    const state = setup(); const fixture = messagingBackupFixture();
    Object.assign(fixture.messaging.users["bi-university-messages-v2:student:student-1"].messages["teacher-1"][0], { replyTo: 99 }); fixture.save();
    const before = JSON.stringify(fixture.archive); const live = [...state.values];
    const report = await state.service.inspect({ ...command, file: new File([before], "messages.json") });
    const download = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize);
    const saved = JSON.parse(await download.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 12, invalid: 0, errors: 0, reviews: 1, unchecked: 0 });
    expect(saved.documents.issues).toContainEqual(expect.objectContaining({ kind: "messaging", code: "unchecked-message-reply", referenceId: fixture.messagingKey, recordId: JSON.stringify(["bi-university-messages-v2:student:student-1", "teacher-1", 1]) }));
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect([...state.values]).toEqual(live);
  });
  it("roundtrips a real export, comparing overlapping IDs by content and retaining all current-only data", async () => {
    const state = setup();
    state.values.set("bi-university-same", '{"v":1}'); state.values.set("bi-university-removed", '"old"');
    const database = rawBackupDatabase(BACKUP_DATABASES[2].name, "files");
    const file = () => new File([new Uint8Array([0, 255])], "answer.bin", { type: "application/octet-stream", lastModified: 42 });
    database.stores[0].records = [
      { key: "same", value: { scope: "user:original-owner", blob: file() } },
      { key: "changed", value: new Blob(["old"]) }, { key: "removed", value: "record" },
    ]; state.databases.set(database.name, database);
    const archive = await state.exportFile();
    state.values.set("bi-university-theme", "dark"); state.values.delete("bi-university-removed"); state.values.set("bi-university-new", "[]");
    database.stores[0].records = [
      { key: "same", value: { blob: file(), scope: "user:original-owner" } },
      { key: "changed", value: new Blob(["new"]) }, { key: "current-only", value: "current" },
    ];
    const before = [...state.values]; const records = [...database.stores[0].records];
    const report = await state.service.inspect({ ...command, file: archive });
    expect(report.comparison).toMatchObject({ same: 3, new: 2, different: 2, currentOnly: 2, schema: 0 });
    expect(report.comparison.differences).toContainEqual({ kind: "different", area: "Файлы заданий и ответов · files", id: "changed" });
    expect(report.comparison.differences).toContainEqual({ kind: "current-only", area: "Локальные данные", id: "bi-university-new" });
    expect(report.sha256).toBe(createHash("sha256").update(new Uint8Array(await archive.arrayBuffer())).digest("hex"));
    expect(report.actor).toEqual({ id: command.actorId, revision: command.actorRevision });
    expect([...state.values]).toEqual(before); expect(database.stores[0].records).toEqual(records);
    expect(report).not.toHaveProperty("archive"); expect(JSON.stringify(report)).not.toContain("base64");
  });
  it("inspects valid absent databases without opening them and does not warn about known string preferences", async () => {
    const state = setup(); state.values.set("bi-university-planner-view", "board"); state.values.set("bi-university-schedule-view:teacher:one", "list");
    const report = await state.service.inspect({ ...command, file: await state.exportFile() });
    expect(state.readDatabase).not.toHaveBeenCalled(); expect(report.comparison.differences).toEqual([]);
    expect(report.warnings.join(" ")).not.toContain("исходные строки");
  });
  it("reports source and raw JSON warnings without interpreting them as authorization or successful restoration", async () => {
    const state = setup(); const archive = backupFixture(); archive.source.origin = "https://other.example";
    archive.localStorage = [{ key: "bi-university-accounts-v1", raw: "{broken" }]; archive.totals.storageEntries = 1;
    const report = await state.service.inspect({ ...command, file: new File([JSON.stringify(archive)], "other.json") });
    expect(report.warnings.join(" ")).toContain("другому адресу"); expect(report.warnings.join(" ")).toContain("исходные строки"); expect(report.warnings.join(" ")).toContain("не подписан");
    expect(report.warnings.join(" ")).toContain("права участников и возможность восстановления ещё не подтверждены");
    expect(report.documents.checks.find((check) => check.kind === "accounts")).toMatchObject({ status: "invalid", message: "Некорректный JSON внутри документа." });
  });
  it("reports incompatible inner documents without losing the readonly comparison or substituting live accounts", async () => {
    const state = setup(); const fixture = coreBackupFixture(); fixture.accounts.accounts[0].status = "blocked"; fixture.save();
    state.dependencies.documentBaseline = { groupIds: [], requiredSubjectIds: ["subject-1"] };
    const report = await state.service.inspect({ ...command, file: new File([JSON.stringify(fixture.archive)], "accounts-without-access.json") });
    expect(report.documents.counts).toMatchObject({ invalid: 1, valid: 3 });
    expect(report.documents.checks[0].message).toContain("отсутствует активный настройщик"); expect(report.comparison.new).toBe(4); expect(state.values.get("bi-university-demo-account")).toBe("configurator-demo");
  });
  it("uses the supplied application baseline and reports missing built-in subjects", async () => {
    const state = setup(); state.dependencies.documentBaseline = { groupIds: [], requiredSubjectIds: ["not-in-this-archive"] };
    const report = await state.service.inspect({ ...command, file: new File([JSON.stringify(coreBackupFixture().archive)], "other-version.json") });
    expect(report.documents.checks.find((check) => check.kind === "subjects")).toMatchObject({ status: "invalid" });
  });
  it("includes checked learning lists and missing references in the downloadable report without answer text", async () => {
    const state = setup(); const fixture = learningBackupFixture();
    fixture.submissions[0].assignmentId = "missing-task"; fixture.save();
    const file = new File([JSON.stringify(fixture.archive)], "learning.json");
    const report = await state.service.inspect({ ...command, file });
    const download = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize);
    const saved = JSON.parse(await download.blob.text());
    expect(saved.documents.checks).toContainEqual(expect.objectContaining({ kind: "submissions", status: "valid", records: 1 }));
    expect(saved.documents.issues).toContainEqual(expect.objectContaining({ kind: "submissions", code: "missing-assignment", referenceId: "missing-task" }));
    expect(saved.documents.counts.unchecked).toBe(0); expect(JSON.stringify(saved)).not.toContain("PRIVATE");
  });
  it("keeps semantic conflicts in the complete downloadable report with safe field names", async () => {
    const state = setup(); const fixture = learningBackupFixture();
    fixture.submissions[0].teacherComment = "PRIVATE STALE FEEDBACK"; fixture.submissions[0].attemptCount = 4; fixture.save();
    const before = JSON.stringify(fixture.archive);
    const report = await state.service.inspect({ ...command, file: new File([before], "conflicting-answer.json") });
    const download = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize);
    const saved = JSON.parse(await download.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 6, invalid: 0, errors: 2 });
    expect(saved.documents.issues).toContainEqual(expect.objectContaining({ kind: "submissions", code: "latest-attempt-mismatch", referenceId: "answer-1", message: expect.stringContaining("комментарий преподавателя") }));
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });
  it("exports journal and history schema findings with list keys and complete counts", async () => {
    const state = setup(); const fixture = journalBackupFixture(); fixture.changes.push({ ...fixture.changes[0] }); fixture.save();
    const before = JSON.stringify(fixture.archive);
    const report = await state.service.inspect({ ...command, file: new File([before], "journal-history.json") });
    const download = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize);
    const saved = JSON.parse(await download.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 7, invalid: 1, unchecked: 0, errors: 1 });
    expect(saved.documents.issues).toContainEqual(expect.objectContaining({ kind: "journalHistory", referenceId: fixture.historyKey, code: "invalid-journal-document" }));
    expect(saved.documents.checks).toContainEqual(expect.objectContaining({ kind: "journals", documents: 1, records: 1, status: "valid" }));
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });
  it("retains distinct planner record findings in the complete report without task text", async () => {
    const state = setup(); const fixture = plannerBackupFixture();
    fixture.notes[0].endAt = fixture.notes[0].startAt; fixture.notes.push({ ...fixture.notes[0], id: "note-2" }); fixture.save();
    const before = JSON.stringify(fixture.archive);
    const report = await state.service.inspect({ ...command, file: new File([before], "planner.json") });
    const download = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize);
    const saved = JSON.parse(await download.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 9, invalid: 0, errors: 2, unchecked: 0 });
    expect(saved.documents.issues).toContainEqual(expect.objectContaining({ kind: "planners", referenceId: fixture.plannerKey, recordId: "note-1" }));
    expect(saved.documents.issues).toContainEqual(expect.objectContaining({ kind: "planners", referenceId: fixture.plannerKey, recordId: "note-2" }));
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });
  it("includes notification findings without title, body or raw links in the complete report", async () => {
    const state = setup(); const fixture = notificationBackupFixture();
    fixture.notifications[0].href = "https://PRIVATE.example"; fixture.notifications[0].recipientUserId = "missing-user"; fixture.save();
    const before = JSON.stringify(fixture.archive);
    const report = await state.service.inspect({ ...command, file: new File([before], "notifications.json") });
    const download = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize);
    const saved = JSON.parse(await download.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 10, invalid: 0, errors: 2, unchecked: 0 });
    for (const code of ["missing-notification-recipient", "invalid-notification-link"]) expect(saved.documents.issues).toContainEqual(expect.objectContaining({ kind: "notifications", code, referenceId: fixture.notificationKey, recordId: "notice-1" }));
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });
  it("includes preference errors with exact keys but no saved values in the complete report", async () => {
    const state = setup(); const fixture = settingsBackupFixture();
    fixture.settings[0].raw = "PRIVATE THEME"; fixture.settings[1].raw = "PRIVATE SELECTED USER"; fixture.save();
    const before = JSON.stringify(fixture.archive);
    const report = await state.service.inspect({ ...command, file: new File([before], "settings.json") });
    const download = prepareBackupInspectionReport({ ...command, inspection: report }, state.authorize);
    const saved = JSON.parse(await download.blob.text());
    expect(saved.documents.counts).toMatchObject({ valid: 10, invalid: 1, errors: 2, unchecked: 0 });
    expect(saved.documents.checks).toContainEqual(expect.objectContaining({ kind: "settings", status: "invalid", keys: 6 }));
    expect(saved.documents.issues).toContainEqual(expect.objectContaining({ code: "invalid-setting-value", referenceId: "bi-university-theme" }));
    expect(saved.documents.issues).toContainEqual(expect.objectContaining({ code: "missing-setting-account", referenceId: "bi-university-demo-account" }));
    expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });
  it("reports presence, schema, indexes and version differences independently of record ID conflicts", async () => {
    const state = setup(); const original = rawBackupDatabase(BACKUP_DATABASES[0].name, "teacher-files");
    state.databases.set(original.name, original); const archive = await state.exportFile();
    original.version = 2; original.stores[0].keyPath = "id"; original.stores[0].indexes.push({ name: "scope", keyPath: "scope", unique: false, multiEntry: false });
    const report = await state.service.inspect({ ...command, file: archive });
    expect(report.comparison.schema).toBe(2); expect(report.comparison.different).toBe(0);
  });
  it("passes all document findings beyond 200 to the report without modifying source data", async () => {
    const state = setup(); const fixture = coreBackupFixture();
    fixture.accounts.accounts[1].memberships = Array.from({ length: 205 }, (_, index) => ({ subjectId: `missing-${index}`, groupIds: ["group-1"] })); fixture.save();
    const file = new File([JSON.stringify(fixture.archive)], "many-issues.json");
    const before = [...state.values];
    const report = await state.service.inspect({ ...command, file });
    expect(report.documents.issues).toHaveLength(205);
    expect(report.documents.issues.at(-1)?.referenceId).toBe("missing-204");
    expect(report.documents.counts.errors).toBe(205);
    expect([...state.values]).toEqual(before);
  });
  it("checks rights before reading a file or current databases", async () => {
    const state = setup(); const file = new File([JSON.stringify(backupFixture())], "archive.json"); const read = vi.spyOn(file, "arrayBuffer");
    state.authorize.mockImplementation(() => { throw new Error("Нет доступа"); });
    await expect(state.service.inspect({ ...command, file })).rejects.toThrow("Нет доступа");
    expect(read).not.toHaveBeenCalled(); expect(state.listDatabases).not.toHaveBeenCalled();
  });
  it("explains unavailable Web Crypto before comparing current data", async () => {
    const state = setup(); const file = new File([JSON.stringify(backupFixture())], "archive.json"); vi.stubGlobal("crypto", {});
    await expect(state.service.inspect({ ...command, file })).rejects.toThrow("недоступно вычисление отпечатка"); expect(state.listDatabases).not.toHaveBeenCalled();
  });
  it.each(["empty", "oversized", "broken", "invalid-utf8", "future", "totals"])("rejects %s before reading current data", async (kind) => {
    const state = setup(); let file: File;
    if (kind === "empty") file = new File([], "empty.json");
    else if (kind === "broken") file = new File(["{oops"], "broken.json");
    else if (kind === "invalid-utf8") file = new File([new Uint8Array([0xff])], "invalid.json");
    else {
      const archive = backupFixture(); if (kind === "future") Object.assign(archive, { version: 99 }); if (kind === "totals") archive.totals.files++;
      file = new File([JSON.stringify(archive)], "archive.json");
      if (kind === "oversized") Object.defineProperty(file, "size", { value: BACKUP_LIMITS.archiveBytes + 1 });
    }
    await expect(state.service.inspect({ ...command, file })).rejects.toThrow(); expect(state.readDatabase).not.toHaveBeenCalled(); expect(state.listDatabases).not.toHaveBeenCalled();
  });
  it("never returns a partial report if the current file store cannot be read", async () => {
    const state = setup(); const archive = new File([JSON.stringify(backupFixture())], "archive.json");
    state.databases.set(BACKUP_DATABASES[0].name, rawBackupDatabase(BACKUP_DATABASES[0].name, "teacher-files")); state.readDatabase.mockRejectedValue(new Error("Чтение недоступно"));
    await expect(state.service.inspect({ ...command, file: archive })).rejects.toThrow("Чтение недоступно");
  });
  it("rejects a current-source change during comparison", async () => {
    const state = setup(); const archive = await state.exportFile();
    state.listDatabases.mockImplementation(async () => { state.values.set("bi-university-theme", "dark"); return []; });
    await expect(state.service.inspect({ ...command, file: archive })).rejects.toThrow("изменились во время сравнения");
  });
  it("rechecks access after reading the file and after comparing current data", async () => {
    const state = setup(); const archive = await state.exportFile(); state.authorize.mockReset();
    state.authorize.mockImplementationOnce(() => undefined).mockImplementation(() => { throw new Error("Доступ отозван"); });
    await expect(state.service.inspect({ ...command, file: archive })).rejects.toThrow("Доступ отозван");
    state.authorize.mockReset().mockImplementationOnce(() => undefined).mockImplementationOnce(() => undefined).mockImplementationOnce(() => undefined).mockImplementation(() => { throw new Error("Доступ отозван"); });
    await expect(state.service.inspect({ ...command, file: archive })).rejects.toThrow("Доступ отозван");
  });
  it("propagates cancellation after file I/O without logging or comparing current data", async () => {
    const state = setup(); const controller = new AbortController(); const file = new File(["{}"], "archive.json");
    vi.spyOn(file, "arrayBuffer").mockImplementation(async () => { controller.abort(); return new ArrayBuffer(0); });
    await expect(state.service.inspect({ ...command, file, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(state.listDatabases).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
  });
});
