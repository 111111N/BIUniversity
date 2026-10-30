import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectJournalPeopleReferences, type JournalPersonReference } from "./journalPeopleReferences";
import { inspectBackupJournals } from "./backupJournalDocuments";
import { BACKUP_CORE_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";
import { journalBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Archived people must never be replaced with current accounts, names or role defaults"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("archived journal people references", () => {
  it("checks row students and per-event actor/student links without editing archived identities", async () => {
    const fixture = journalBackupFixture(); const before = JSON.stringify(fixture.archive);
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([]);
    expect(review.checks.find((check) => check.kind === "journals")!.message).toContain("Ссылок на ID учёток архива: найдено 1; отсутствует 0; не проверено 0");
    expect(review.checks.find((check) => check.kind === "journalHistory")!.message).toContain("Ссылок на ID учёток архива: найдено 2; отсутствует 0; не проверено 0");
    expect(JSON.stringify(fixture.archive)).toBe(before); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("reports missing historical students and authors as review, without matching identical names", async () => {
    const fixture = journalBackupFixture(); fixture.students[0].id = "old-student"; fixture.students[0].name = fixture.accounts.accounts[2].name;
    fixture.changes[0].studentId = "old-student"; fixture.changes[0].studentName = fixture.students[0].name;
    fixture.changes[0].actor = { ...fixture.changes[0].actor, id: "old-teacher", name: fixture.accounts.accounts[1].name }; fixture.save();
    const before = JSON.stringify(fixture.archive); const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 8, invalid: 0, errors: 0, reviews: 3 });
    expect(review.issues).toEqual([
      expect.objectContaining({ kind: "journals", level: "review", code: "missing-journal-student-account", referenceId: fixture.journalKey, recordId: "old-student" }),
      expect.objectContaining({ kind: "journalHistory", level: "review", code: "missing-journal-actor-account", referenceId: fixture.historyKey, recordId: "change-1" }),
      expect.objectContaining({ kind: "journalHistory", level: "review", code: "missing-journal-student-account", referenceId: fixture.historyKey, recordId: "change-1" }),
    ]);
    expect(JSON.stringify(review)).not.toContain(fixture.students[0].name); expect(JSON.stringify(review)).not.toContain(fixture.changes[0].actor.name);
    expect(JSON.stringify(fixture.archive)).toBe(before);
  });

  it.each(["roles", "blocked", "graduated", "moved"] as const)("does not invalidate an existing ID because current account state is %s", async (state) => {
    const fixture = journalBackupFixture(); const teacher = fixture.accounts.accounts[1]; const student = fixture.accounts.accounts[2];
    if (state === "roles") { teacher.role = "configurator"; teacher.memberships = []; student.role = "teacher"; delete student.studentGroupId; }
    if (state === "blocked") { teacher.status = "blocked"; student.status = "blocked"; }
    if (state === "graduated") student.enrollmentStatus = "graduated";
    if (state === "moved") {
      fixture.groups.groups.push({ ...fixture.groups.groups[0], id: "group-2", name: "102-ИВТ" });
      student.studentGroupId = "group-2"; student.memberships[0].groupIds = ["group-2"];
    }
    fixture.save(); const before = JSON.stringify(fixture.archive); const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([]); expect(JSON.stringify(fixture.archive)).toBe(before);
    expect(review.checks.find((check) => check.kind === "journalHistory")!.message).toContain("Совпадение ID не подтверждает историческую роль");
  });

  it("does not treat a demo batch target as a student, while still checking its author", async () => {
    const fixture = journalBackupFixture(); const event = fixture.changes[0]; event.field = "demo"; event.studentId = "batch-without-account";
    event.previousValue = null; event.nextValue = "PRIVATE BATCH DESCRIPTION"; delete event.lessonId; event.actor.id = "missing-author"; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([expect.objectContaining({ code: "missing-journal-actor-account", recordId: "change-1" })]);
    expect(review.checks.find((check) => check.kind === "journalHistory")!.message).toContain("Ссылок на ID учёток архива: найдено 0; отсутствует 1; не проверено 0");
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("does not exempt demo-import when it is used as the student ID of a normal cell event", async () => {
    const fixture = journalBackupFixture(); fixture.students[0].id = "demo-import"; fixture.changes[0].studentId = "demo-import"; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.map((issue) => [issue.kind, issue.code])).toEqual([["journals", "missing-journal-student-account"], ["journalHistory", "missing-journal-student-account"]]);
  });

  it("keeps removed roster students verifiable without requiring them in the saved journal", async () => {
    const fixture = journalBackupFixture(); fixture.students.length = 0; const event = fixture.changes[0]; event.field = "roster";
    event.studentId = "former-student"; event.previousValue = "active"; event.nextValue = "removed"; delete event.lessonId; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([expect.objectContaining({ kind: "journalHistory", code: "missing-journal-student-account", recordId: "change-1" })]);
  });

  it.each([undefined, "{broken", JSON.stringify({ version: 1, revision: 1, accounts: [{ id: "teacher-1" }], history: [] })])("does not replace unavailable accounts with live data or a readable subset: %s", async (raw) => {
    const fixture = journalBackupFixture(); fixture.archive.localStorage = fixture.archive.localStorage.filter((entry) => entry.key !== BACKUP_CORE_DOCUMENTS.accounts.key);
    if (raw !== undefined) fixture.archive.localStorage.push({ key: BACKUP_CORE_DOCUMENTS.accounts.key, raw });
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.filter((issue) => issue.code === "unchecked-journal-people")).toEqual([
      expect.objectContaining({ kind: "journals", referenceId: fixture.journalKey }), expect.objectContaining({ kind: "journalHistory", referenceId: fixture.historyKey }),
    ]);
    expect(review.issues.some((issue) => issue.code === "missing-journal-student-account" || issue.code === "missing-journal-actor-account")).toBe(false);
    expect(review.checks.find((check) => check.kind === "journalHistory")!.message).toContain("Ссылок на ID учёток архива: найдено 0; отсутствует 0; не проверено 2");
  });

  it.each(["journals", "journalHistory"] as const)("does not check people in a readable subset of invalid %s", async (kind) => {
    const fixture = journalBackupFixture(); const key = kind === "journals" ? fixture.journalKey : fixture.historyKey;
    const rows = kind === "journals" ? [{ ...fixture.students[0], id: "missing-student" }] : [{ ...fixture.changes[0], actor: { id: "missing-author", name: "PRIVATE" } }];
    fixture.archive.localStorage.find((entry) => entry.key === key)!.raw = JSON.stringify([...rows, { id: "broken" }]);
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.some((issue) => issue.code === "missing-journal-student-account" || issue.code === "missing-journal-actor-account")).toBe(false);
    expect(review.checks.find((check) => check.kind === kind)!.message).toContain("Ссылок на ID учёток архива: найдено 0; отсутствует 0; не проверено 0");
  });

  it("keeps literal IDs, event targets and repeated references separate without mutating frozen input", async () => {
    const rows = Object.freeze([
      Object.freeze({ accountId: "a:b", recordId: "event-1", target: "actor" as const }),
      Object.freeze({ accountId: "a:b", recordId: "event-1", target: "student" as const }),
      Object.freeze({ accountId: "%3A", recordId: "event-2", target: "student" as const }),
      Object.freeze({ accountId: "constructor", recordId: "event-3", target: "actor" as const }),
    ]); const ids = new Set(["a:b", ":", "constructor"]); const before = JSON.stringify(rows);
    const result = await inspectJournalPeopleReferences(rows, ids);
    expect(result).toMatchObject({ matched: 3, missing: 1, unchecked: 0, issues: [expect.objectContaining({ recordId: "event-2", code: "missing-journal-student-account" })] });
    expect(JSON.stringify(rows)).toBe(before); expect([...ids]).toEqual(["a:b", ":", "constructor"]);
  });

  it("distinguishes an empty account index from an unavailable one, and leaves empty lists quiet", async () => {
    const rows: JournalPersonReference[] = [{ accountId: "person", recordId: "event", target: "actor" }];
    expect(await inspectJournalPeopleReferences(rows, new Set())).toMatchObject({ matched: 0, missing: 1, unchecked: 0 });
    expect(await inspectJournalPeopleReferences(rows)).toMatchObject({ matched: 0, missing: 0, unchecked: 1 });
    expect(await inspectJournalPeopleReferences([])).toEqual({ issues: [], matched: 0, missing: 0, unchecked: 0 });
    const fixture = journalBackupFixture(); fixture.students.length = 0; fixture.changes.length = 0; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo"); expect(review.issues).toEqual([]);
  });

  it("does not claim verification when schema inspection is called without archived accounts", async () => {
    const fixture = journalBackupFixture(); const review = await inspectBackupJournals(fixture.archive.localStorage);
    expect(review.checks[0].message).toContain("Ссылки на учётки студентов и авторов не проверялись");
  });

  it("keeps findings beyond 200 and supports cancellation without returning a partial review", async () => {
    const rows: JournalPersonReference[] = Array.from({ length: 300 }, (_, index) => ({ accountId: `missing-${index}`, recordId: `event-${index}`, target: "actor" }));
    const review = await inspectJournalPeopleReferences(rows, new Set()); expect(review.issues).toHaveLength(300); expect(review.issues.at(-1)?.recordId).toBe("event-299");
    expect((await inspectJournalPeopleReferences(rows)).issues).toHaveLength(1);
    const controller = new AbortController(); const pending = inspectJournalPeopleReferences(rows, new Set(), controller.signal); const timer = setTimeout(() => controller.abort(), 0);
    try { await expect(pending).rejects.toMatchObject({ name: "AbortError" }); } finally { clearTimeout(timer); }
    const aborted = new AbortController(); aborted.abort();
    await expect(inspectJournalPeopleReferences([], undefined, aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
