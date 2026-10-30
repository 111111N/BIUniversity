import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalActor } from "../data/journalStore";
import { inspectJournalActorContexts } from "./journalActorContexts";
import { inspectBackupJournals } from "./backupJournalDocuments";
import { BACKUP_CORE_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";
import { journalBackupFixture } from "../testSupport/localBackupDocuments";

const area = { status: "matched" as const, subjectId: "subject-1", groupId: "group-1" };
const actor = (patch: Partial<JournalActor> = {}): JournalActor => ({ id: "teacher-1", name: "PRIVATE ACTOR", role: "teacher", memberships: [{ subjectId: "subject-1", groupIds: ["group-1"] }], ...patch });
const forbidden = vi.fn(() => { throw new Error("Captured actor context must not be filled from current accounts or teacher assignments"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("captured journal actor context", () => {
  it("checks immutable captured claims without authenticating the actor or mutating assignments", async () => {
    const captured = actor(); Object.freeze(captured.memberships![0].groupIds); Object.freeze(captured.memberships![0]); Object.freeze(captured.memberships); Object.freeze(captured);
    const rows = Object.freeze([Object.freeze({ id: "event", actor: captured })]); const before = JSON.stringify(rows);
    expect(await inspectJournalActorContexts(rows, area)).toEqual({ issues: [], consistent: 1, conflicting: 0, incomplete: 0, uncheckedArea: 0 });
    expect(JSON.stringify(rows)).toBe(before);
  });

  it.each(["student", "configurator"] as const)("reviews the captured %s role against the current writer contract, without declaring an unauthorized edit", async (role) => {
    const result = await inspectJournalActorContexts([{ id: "event", actor: actor({ role }) }], area);
    expect(result).toMatchObject({ consistent: 0, conflicting: 1, incomplete: 0, uncheckedArea: 0, issues: [expect.objectContaining({ id: "event", level: "review", code: "conflicting-journal-actor-context" })] });
    expect(result.issues[0].message).toContain("это не доказательство неправомерного изменения"); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it.each([
    { role: undefined }, { memberships: undefined }, { role: undefined, memberships: undefined },
  ])("does not infer a missing role or assignments from the remaining fields: %j", async (patch) => {
    const result = await inspectJournalActorContexts([{ id: "event", actor: actor(patch) }], area);
    expect(result).toMatchObject({ consistent: 0, conflicting: 0, incomplete: 1, uncheckedArea: 0, issues: [expect.objectContaining({ id: "event", code: "incomplete-journal-actor-context" })] });
  });

  it.each([
    [], [{ subjectId: "other-subject", groupIds: ["group-1"] }], [{ subjectId: "subject-1", groupIds: [] }], [{ subjectId: "subject-1", groupIds: ["other-group"] }],
    [{ subjectId: "subject-1", groupIds: ["other-group"] }, { subjectId: "other-subject", groupIds: ["group-1"] }],
  ])("does not combine a subject from one assignment and a group from another: %j", async (...memberships) => {
    const result = await inspectJournalActorContexts([{ id: "event", actor: actor({ memberships }) }], area);
    expect(result).toMatchObject({ consistent: 0, conflicting: 1, issues: [expect.objectContaining({ code: "conflicting-journal-actor-context" })] });
  });

  it("finds a matching pair among unrelated assignments and keeps IDs literal", async () => {
    const memberships = [{ subjectId: "other", groupIds: ["group-1"] }, { subjectId: "subject-1", groupIds: ["other", "group-1"] }];
    expect((await inspectJournalActorContexts([{ id: "event", actor: actor({ memberships }) }], area)).consistent).toBe(1);
    const literal = actor({ memberships: [{ subjectId: "a:b", groupIds: ["c"] }] });
    expect((await inspectJournalActorContexts([{ id: "event", actor: literal }], { status: "matched", subjectId: "a", groupId: "b:c" })).conflicting).toBe(1);
    expect((await inspectJournalActorContexts([{ id: "event", actor: literal }], { status: "matched", subjectId: "a:b", groupId: "c" })).consistent).toBe(1);
    expect((await inspectJournalActorContexts([{ id: "event", actor: actor({ memberships: [{ subjectId: "SUBJECT-1", groupIds: ["group-1"] }] }) }], area)).conflicting).toBe(1);
  });

  it.each(["ambiguous", "unresolved", "unavailable"] as const)("does not derive an %s list area from an author's assignments", async (status) => {
    expect(await inspectJournalActorContexts([{ id: "event", actor: actor() }], { status })).toEqual({ issues: [], consistent: 0, conflicting: 0, incomplete: 0, uncheckedArea: 1 });
  });

  it("does not cache claims by account ID across events", async () => {
    const result = await inspectJournalActorContexts([{ id: "matching", actor: actor() }, { id: "different", actor: actor({ memberships: [] }) }, { id: "old", actor: actor({ role: undefined }) }], area);
    expect(result).toMatchObject({ consistent: 1, conflicting: 1, incomplete: 1, uncheckedArea: 0 }); expect(result.issues.map((issue) => issue.id)).toEqual(["different", "old"]);
  });

  it.each(["attendance", "grade", "roster", "demo"] as const)("checks the same captured contract for a %s event", async (field) => {
    const fixture = journalBackupFixture(); const event = fixture.changes[0]; event.field = field;
    if (field === "grade") { event.previousValue = null; event.nextValue = 5; }
    if (field === "roster" || field === "demo") { event.previousValue = null; event.nextValue = field === "roster" ? "added" : "PRIVATE SUMMARY"; delete event.lessonId; }
    fixture.save(); const before = JSON.stringify(fixture.archive); const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([]);
    expect(review.checks.find((check) => check.kind === "journalHistory")!.message).toContain("Сохранённый контекст автора: соответствует текущему контракту 1; расходится 0; не хватает данных 0; не определена область 0");
    expect(JSON.stringify(fixture.archive)).toBe(before); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("does not fill a missing event context from an account that currently has a matching assignment", async () => {
    const fixture = journalBackupFixture(); delete fixture.changes[0].actor.role; delete fixture.changes[0].actor.memberships; fixture.save();
    const before = JSON.stringify(fixture.archive); const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 8, invalid: 0, errors: 0, reviews: 1 });
    expect(review.issues).toEqual([expect.objectContaining({ kind: "journalHistory", code: "incomplete-journal-actor-context", referenceId: fixture.historyKey, recordId: "change-1" })]);
    expect(JSON.stringify(fixture.archive)).toBe(before);
  });

  it("does not use a current matching assignment to hide a conflicting captured context", async () => {
    const fixture = journalBackupFixture(); fixture.changes[0].actor.memberships = []; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([expect.objectContaining({ level: "review", code: "conflicting-journal-actor-context", recordId: "change-1" })]);
  });

  it("does not overwrite captured matching claims with today's changed role or lesson teacher", async () => {
    const fixture = journalBackupFixture(); const teacher = fixture.accounts.accounts[1];
    fixture.accounts.accounts.push({ ...teacher, id: "teacher-2", login: "teacher2", name: "Другой Преподаватель" }); teacher.role = "configurator"; teacher.memberships = [];
    fixture.schedule.journal[0].teacherId = "teacher-2"; fixture.schedule.published[0].lessons[0].teacherId = "teacher-2"; fixture.schedule.drafts[0].lessons[0].teacherId = "teacher-2"; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo"); expect(review.issues).toEqual([]);
    expect(review.checks.find((check) => check.kind === "journalHistory")!.message).toContain("Это сверка утверждений внутри события, а не подтверждение реальных прав на его дату");
  });

  it("keeps source identity checks independent of consistent captured claims", async () => {
    const fixture = journalBackupFixture(); fixture.changes[0].actor.id = "missing-actor"; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([expect.objectContaining({ code: "missing-journal-actor-account" })]);
    expect(review.checks.find((check) => check.kind === "journalHistory")!.message).toContain("Сохранённый контекст автора: соответствует текущему контракту 1");
  });

  it("checks captured contexts even if account documents are absent, without treating them as authorization", async () => {
    const fixture = journalBackupFixture(); fixture.archive.localStorage = fixture.archive.localStorage.filter((entry) => entry.key !== BACKUP_CORE_DOCUMENTS.accounts.key);
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.some((issue) => issue.code === "unchecked-journal-people")).toBe(true);
    expect(review.checks.find((check) => check.kind === "journalHistory")!.message).toContain("Сохранённый контекст автора: соответствует текущему контракту 1");
  });

  it("does not inspect the readable subset of a broken history and reports an unchecked schema-only call", async () => {
    const fixture = journalBackupFixture(); const row = { ...fixture.changes[0], actor: actor({ role: "student" }) };
    fixture.archive.localStorage.find((entry) => entry.key === fixture.historyKey)!.raw = JSON.stringify([row, { id: "broken" }]);
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.map((issue) => issue.code)).toEqual(["invalid-journal-document"]);
    expect(review.checks.find((check) => check.kind === "journalHistory")!.message).toContain("Сохранённый контекст автора: соответствует текущему контракту 0; расходится 0; не хватает данных 0; не определена область 0");
    const partial = await inspectBackupJournals(fixture.archive.localStorage);
    expect(partial.checks[1].message).toContain("Сохранённый контекст автора не сверялся");
  });

  it("retains all findings and supports cancellation within events, assignments and large group lists", async () => {
    const rows = Array.from({ length: 300 }, (_, index) => ({ id: `event-${index}`, actor: actor({ role: "student" }) }));
    const review = await inspectJournalActorContexts(rows, area); expect(review.conflicting).toBe(300); expect(review.issues).toHaveLength(300); expect(review.issues.at(-1)?.id).toBe("event-299");
    const manyAssignments = [{ id: "event", actor: actor({ memberships: Array.from({ length: 300 }, (_, index) => ({ subjectId: `other-${index}`, groupIds: ["group-1"] })) }) }];
    const manyGroups = [{ id: "event", actor: actor({ memberships: [{ subjectId: "subject-1", groupIds: Array.from({ length: 300 }, (_, index) => `other-${index}`) }] }) }];
    for (const source of [rows, manyAssignments, manyGroups]) {
      const controller = new AbortController(); const pending = inspectJournalActorContexts(source, area, controller.signal); const timer = setTimeout(() => controller.abort(), 0);
      try { await expect(pending).rejects.toMatchObject({ name: "AbortError" }); } finally { clearTimeout(timer); }
    }
    const aborted = new AbortController(); aborted.abort(); await expect(inspectJournalActorContexts([], area, aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
