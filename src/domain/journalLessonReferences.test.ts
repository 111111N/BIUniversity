import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createArchivedJournalLessonIndex, inspectJournalLessonReferences } from "./journalLessonReferences";
import { createEmptyManagedSchedule, type ManagedJournalEntry } from "./scheduleManagement";
import { inspectBackupJournals } from "./backupJournalDocuments";
import { BACKUP_CORE_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";
import { journalBackupFixture } from "../testSupport/localBackupDocuments";

const area = { status: "matched" as const, subjectId: "subject-1", groupId: "group-1" };
const lesson = (patch: Partial<ManagedJournalEntry> = {}): ManagedJournalEntry => ({ id: "managed:lesson-1", scheduleId: 1, subjectId: "subject-1", groupId: "group-1", teacherId: "teacher-1", teacherName: "PRIVATE TEACHER", date: "2026-10-28", startsAt: "09:00", endsAt: "10:30", type: "practice", room: "PRIVATE ROOM", journalState: "cancelled", ...patch });
const forbidden = vi.fn(() => { throw new Error("Archived lesson references must not consult live schedules or enrollments"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("archived journal lesson references", () => {
  it.each(["active", "cancelled", "rescheduled"] as const)("matches exact retained %s identities without treating them as proof of attendance or rights", async (journalState) => {
    const fixture = journalBackupFixture(); const snapshot = fixture.schedule;
    snapshot.journal[0].journalState = journalState; if (journalState !== "active") snapshot.published.length = 0;
    fixture.save(); const before = JSON.stringify(fixture.archive);
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([]);
    expect(review.checks.filter((check) => check.kind === "journals" || check.kind === "journalHistory").every((check) => check.message.includes("Связей с сохранёнными занятиями своей дисциплины и группы: 1; не подтверждено: 0"))).toBe(true);
    expect(JSON.stringify(fixture.archive)).toBe(before); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("keeps retained identities from before a move to another group", async () => {
    const fixture = journalBackupFixture(); fixture.groups.groups.push({ ...fixture.groups.groups[0], id: "group-2", name: "102-ИВТ" });
    fixture.schedule.journal[0].journalState = "rescheduled";
    const week = fixture.schedule.published[0]; week.groupId = "group-2"; week.lessons[0].groupId = "group-2";
    fixture.schedule.journal.push({ ...week.lessons[0], journalState: "active" }); fixture.save();
    expect((await inspectBackupDocuments(fixture.archive, "configurator-demo")).issues).toEqual([]);
  });

  it.each(["draft-only", "missing", "foreign-area"] as const)("reports %s links as review with technical source IDs, preserving readable schema", async (status) => {
    const fixture = journalBackupFixture();
    if (status === "foreign-area") {
      fixture.subjects.subjects.push({ ...fixture.subjects.subjects[0], id: "subject-2", name: "PRIVATE OTHER SUBJECT", shortName: "OTHER" });
      fixture.schedule.journal[0].subjectId = "subject-2"; fixture.schedule.published[0].lessons[0].subjectId = "subject-2";
    } else {
      fixture.schedule.journal.length = 0; fixture.schedule.published.length = 0;
      if (status === "missing") fixture.schedule.drafts.length = 0;
    }
    fixture.save(); const before = JSON.stringify(fixture.archive); const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 8, invalid: 0, errors: 0, reviews: 2 });
    expect(review.issues).toEqual([
      expect.objectContaining({ code: `${status}-journal-lesson`, level: "review", kind: "journals", referenceId: fixture.journalKey, recordId: JSON.stringify(["student-1", "managed:lesson-1"]) }),
      expect.objectContaining({ code: `${status}-journal-lesson`, level: "review", kind: "journalHistory", referenceId: fixture.historyKey, recordId: "change-1" }),
    ]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });

  it.each(["2026-10-28", "subject-1:group-1:2026-fall:1", "MANAGED:lesson-1", "managed%3Alesson-1"])("does not migrate or infer an old lesson key: %s", async (lessonId) => {
    const fixture = journalBackupFixture(); fixture.students[0].attendance = { [lessonId]: "present" }; fixture.students[0].grades = { [lessonId]: 5 }; fixture.changes[0].lessonId = lessonId; fixture.save();
    const before = JSON.stringify(fixture.archive); const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.map((issue) => issue.code)).toEqual(["legacy-journal-lesson", "legacy-journal-lesson"]);
    expect(JSON.stringify(fixture.archive)).toBe(before);
  });

  it("does not substitute a same-date lesson when a stable ID is absent", async () => {
    const fixture = journalBackupFixture(); const missingId = "managed:missing";
    fixture.students[0].attendance = { [missingId]: "present" }; fixture.students[0].grades = {}; fixture.changes[0].lessonId = missingId; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.map((issue) => issue.code)).toEqual(["missing-journal-lesson", "missing-journal-lesson"]);
  });

  it.each([undefined, "{broken", JSON.stringify({ version: 1, revision: 1, drafts: [], published: [], journal: [lesson(), { id: "broken" }] })])("reports unavailable schedules once per readable list without partial lesson indexes: %s", async (raw) => {
    const fixture = journalBackupFixture(); fixture.archive.localStorage = fixture.archive.localStorage.filter((entry) => entry.key !== BACKUP_CORE_DOCUMENTS.schedule.key);
    if (raw !== undefined) fixture.archive.localStorage.push({ key: BACKUP_CORE_DOCUMENTS.schedule.key, raw });
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.filter((issue) => issue.code === "unchecked-journal-lessons")).toEqual([
      expect.objectContaining({ kind: "journals", referenceId: fixture.journalKey }), expect.objectContaining({ kind: "journalHistory", referenceId: fixture.historyKey }),
    ]);
    expect(review.checks.filter((check) => check.kind === "journals" || check.kind === "journalHistory").every((check) => check.message.includes("Связей с сохранёнными занятиями своей дисциплины и группы: 0; не подтверждено: 1"))).toBe(true);
  });

  it("does not repeat unresolved area findings for every cell or use an ambiguous catalog split", async () => {
    const snapshot = createEmptyManagedSchedule(); snapshot.journal.push(lesson()); const index = await createArchivedJournalLessonIndex(snapshot);
    for (const status of ["ambiguous", "unresolved", "unavailable"] as const) {
      expect(await inspectJournalLessonReferences([{ lessonId: "managed:lesson-1", recordId: "record" }], index, { status })).toEqual({ matched: 0, unresolved: 1, issues: [] });
    }
  });

  it("keeps student/lesson composite IDs and exact subject/group IDs separate", async () => {
    const snapshot = createEmptyManagedSchedule(); snapshot.journal.push(lesson({ subjectId: "a:b", groupId: "c" }));
    const index = await createArchivedJournalLessonIndex(snapshot);
    expect(index.resolve("managed:lesson-1", { status: "matched", subjectId: "a", groupId: "b:c" })).toBe("foreign-area");
    expect(index.resolve("managed:lesson-1", { status: "matched", subjectId: "a:b", groupId: "c" })).toBe("matched");
  });

  it("counts both fields once per student/lesson, retains per-event history links, and checks explicit null grades", async () => {
    const fixture = journalBackupFixture(); fixture.students[0].grades["managed:grade-only"] = null;
    fixture.changes.push({ ...fixture.changes[0], id: "second-event", nextValue: "unmarked" }); fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([expect.objectContaining({ code: "missing-journal-lesson", recordId: JSON.stringify(["student-1", "managed:grade-only"]) })]);
    expect(review.checks.find((check) => check.kind === "journals")!.message).toContain("Связей с сохранёнными занятиями своей дисциплины и группы: 1; не подтверждено: 1");
    expect(review.checks.find((check) => check.kind === "journalHistory")!.message).toContain("Связей с сохранёнными занятиями своей дисциплины и группы: 2; не подтверждено: 0");
  });

  it("does not treat roster/demo lesson links as cell history or infer a missing lesson ID", async () => {
    const fixture = journalBackupFixture(); const original = fixture.changes[0];
    fixture.changes.splice(0, 1, { ...original, id: "roster", field: "roster", previousValue: null, nextValue: "added", lessonId: "managed:missing" }, { ...original, id: "demo", field: "demo", previousValue: null, nextValue: "PRIVATE DESCRIPTION", lessonId: "managed:missing" }, { ...original, id: "no-lesson", lessonId: undefined }); fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.map((issue) => issue.code)).toEqual(["unexpected-history-lesson", "unexpected-history-lesson", "missing-history-lesson"]);
    expect(review.checks.find((check) => check.kind === "journalHistory")!.message).toContain("Связей с сохранёнными занятиями своей дисциплины и группы: 0; не подтверждено: 0");
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("does not inspect the readable subset of a structurally broken journal list", async () => {
    const fixture = journalBackupFixture(); fixture.archive.localStorage.find((entry) => entry.key === fixture.journalKey)!.raw = JSON.stringify([fixture.students[0], { id: "broken" }]);
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.checks.find((check) => check.kind === "journals")!.message).toContain("Связей с сохранёнными занятиями своей дисциплины и группы: 0; не подтверждено: 0");
    expect(review.issues.some((issue) => issue.code === "missing-journal-lesson")).toBe(false);
  });

  it("reports that lesson checks were not requested when only schemas are inspected", async () => {
    const fixture = journalBackupFixture(); const review = await inspectBackupJournals(fixture.archive.localStorage);
    expect(review.checks[0].message).toContain("Ссылки на конкретные занятия не проверялись");
  });

  it("retains more than 200 findings and cancels during reference inspection and index construction", async () => {
    const references = Array.from({ length: 300 }, (_, index) => ({ recordId: `event-${index}`, lessonId: `managed:missing-${index}` }));
    const index = await createArchivedJournalLessonIndex(createEmptyManagedSchedule()); const review = await inspectJournalLessonReferences(references, index, area);
    expect(review.unresolved).toBe(300); expect(review.issues).toHaveLength(300); expect(review.issues.at(-1)?.recordId).toBe("event-299");
    const snapshot = createEmptyManagedSchedule(); snapshot.journal = references.map((reference, sequence) => lesson({ id: reference.lessonId, scheduleId: sequence + 1 }));
    for (const operation of [(signal: AbortSignal) => inspectJournalLessonReferences(references, index, area, signal), (signal: AbortSignal) => createArchivedJournalLessonIndex(snapshot, signal)]) {
      const controller = new AbortController(); const pending = operation(controller.signal); const timer = setTimeout(() => controller.abort(), 0);
      try { await expect(pending).rejects.toMatchObject({ name: "AbortError" }); } finally { clearTimeout(timer); }
    }
    const aborted = new AbortController(); aborted.abort();
    await expect(createArchivedJournalLessonIndex(undefined, aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
