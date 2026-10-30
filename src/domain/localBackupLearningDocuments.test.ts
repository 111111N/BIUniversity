import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { learningBackupFixture } from "../testSupport/localBackupDocuments";
import { BACKUP_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Live data must never be read or written"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("archived assignments and attempt histories", () => {
  it("validates both lists and their archived references without normalization, live reads or private text in the report", async () => {
    const state = learningBackupFixture(); const before = JSON.stringify(state.archive);
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts).toEqual({ valid: 6, invalid: 0, absent: 7, unchecked: 0, errors: 0, reviews: 0 });
    expect(review.checks.find((check) => check.kind === "assignments")).toMatchObject({ status: "valid", records: 1 });
    expect(review.checks.find((check) => check.kind === "submissions")).toMatchObject({ status: "valid", records: 1 });
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(state.archive)).toBe(before);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("distinguishes saved empty lists from missing data without inserting demonstration work", async () => {
    const state = learningBackupFixture(); state.assignments.length = 0; state.submissions.length = 0; state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts.valid).toBe(6); expect(review.counts.absent).toBe(7);
    expect(review.checks.filter((check) => check.records === 0)).toHaveLength(2);
    expect(review.issues).toEqual([]);
  });

  it.each([
    ["assignments", "{broken"], ["assignments", "{}"], ["assignments", "[null]"],
    ["submissions", "{broken"], ["submissions", "{}"], ["submissions", "[null]"],
  ] as const)("reports malformed %s without discarding the remaining archive", async (kind, raw) => {
    const state = learningBackupFixture(); state.archive.localStorage.find((entry) => entry.key === BACKUP_DOCUMENTS[kind].key)!.raw = raw;
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.checks.find((check) => check.kind === kind)?.status).toBe("invalid");
    expect(review.counts.valid).toBe(5); expect(review.counts.invalid).toBe(1);
    expect(review.issues).toContainEqual(expect.objectContaining({ kind, code: "invalid-document", level: "error" }));
  });

  it.each([
    { id: "" }, { deadline: "wrong" }, { subjectId: 123 }, { groupId: "" }, { lessonType: "Unknown" },
    { status: "unknown" }, { allowLateSubmissions: "false" }, { attachmentName: {} }, { updatedAt: "wrong" },
  ])("rejects damaged assignment fields: %j", async (change) => {
    const state = learningBackupFixture(); Object.assign(state.assignments[0], change); state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.checks.find((check) => check.kind === "assignments")?.status).toBe("invalid");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "unchecked-assignment", level: "review" }));
  });

  it.each([
    { studentId: "" }, { assignmentId: "" }, { sentAt: "wrong" }, { status: "unknown" }, { attemptCount: 1.5 },
    { attempts: [null] }, { attempts: [{ id: "broken" }] }, { text: {} },
  ])("rejects damaged submissions without passing answer contents into findings: %j", async (change) => {
    const state = learningBackupFixture(); Object.assign(state.submissions[0], change); state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.checks.find((check) => check.kind === "submissions")?.status).toBe("invalid");
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it.each(["assignments", "submissions"] as const)("rejects duplicate record IDs in %s", async (kind) => {
    const state = learningBackupFixture();
    if (kind === "assignments") state.assignments.push({ ...state.assignments[0] });
    else state.submissions.push({ ...state.submissions[0] });
    state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.checks.find((check) => check.kind === kind)?.status).toBe("invalid");
  });

  it.each(["number", "date", "duplicate"])("rejects a broken attempt history: %s", async (kind) => {
    const state = learningBackupFixture(); const attempts = state.submissions[0].attempts!;
    if (kind === "number") attempts[0].number = 2;
    if (kind === "date") attempts[0].updatedAt = "2026-10-27T12:00";
    if (kind === "duplicate") attempts.push({ ...attempts[0], number: 2 });
    state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.checks.find((check) => check.kind === "submissions")?.status).toBe("invalid");
  });

  it("keeps legacy top-level answers readable and flags missing assignment IDs without guessing by name", async () => {
    const state = learningBackupFixture();
    delete state.submissions[0].attempts; delete state.submissions[0].attemptCount;
    delete (state.assignments[0] as Partial<typeof state.assignments[0]>).subjectId;
    delete (state.assignments[0] as Partial<typeof state.assignments[0]>).groupId;
    state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts.valid).toBe(6);
    expect(review.issues).toContainEqual(expect.objectContaining({ kind: "assignments", code: "legacy-identifiers", referenceId: "task-1", level: "review" }));
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("accepts multiple ordered attempts and older reviews without reviewedAt", async () => {
    const state = learningBackupFixture();
    state.submissions[0].attempts![0].status = "revision";
    state.submissions[0].attempts!.push({ ...state.submissions[0].attempts![0], id: "attempt-2", number: 2, sentAt: "2026-10-29T12:00", updatedAt: "2026-10-29T13:00", status: "graded", grade: "5" });
    Object.assign(state.submissions[0], { status: "graded", grade: "5", updatedAt: "2026-10-29T13:00", attemptCount: 2 });
    state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts.valid).toBe(6); expect(review.counts.errors).toBe(0);
  });

  it("flags a future learning key without treating it as the supported list", async () => {
    const state = learningBackupFixture();
    state.archive.localStorage.find((entry) => entry.key === BACKUP_DOCUMENTS.assignments.key)!.key += "-v2";
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.checks.find((check) => check.kind === "assignments")?.status).toBe("absent");
    expect(review.issues).toContainEqual(expect.objectContaining({ kind: "assignments", code: "unsupported-key", level: "error" }));
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "unchecked-assignment", level: "review" }));
  });

  it("checks missing subject, group, assignment and student against archive IDs", async () => {
    const state = learningBackupFixture(); state.assignments[0].subjectId = "missing-subject"; state.assignments[0].groupId = "missing-group";
    state.submissions[0].assignmentId = "missing-task"; state.submissions[0].studentId = "missing-student"; state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    for (const code of ["missing-subject", "missing-group", "missing-assignment", "missing-student"]) expect(review.issues).toContainEqual(expect.objectContaining({ code, level: "error" }));
  });

  it("marks dependencies unverified when source documents are absent", async () => {
    const state = learningBackupFixture();
    const missingKeys = new Set<string>([BACKUP_DOCUMENTS.accounts.key, BACKUP_DOCUMENTS.assignments.key]);
    state.archive.localStorage = state.archive.localStorage.filter((entry) => !missingKeys.has(entry.key));
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    for (const code of ["unchecked-assignment", "unchecked-student"]) expect(review.issues).toContainEqual(expect.objectContaining({ code, level: "review" }));
    expect(review.issues.some((issue) => issue.code === "missing-assignment" || issue.code === "missing-student")).toBe(false);
  });

  it("retains historical answers after a change of current group or account role", async () => {
    const state = learningBackupFixture(); state.accounts.accounts[2].role = "teacher"; state.accounts.accounts[2].studentGroupId = undefined; state.accounts.accounts[2].memberships = [];
    state.assignments[0].status = "archived"; state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts.errors).toBe(0); expect(review.counts.reviews).toBe(0);
  });

  it("flags competing workflow records without merging their histories", async () => {
    const state = learningBackupFixture(); state.submissions.push({ ...state.submissions[0], id: "second-workflow" }); state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "duplicate-workflow", referenceId: "second-workflow", level: "review" }));
    expect(state.submissions).toHaveLength(2);
  });

  it("keeps readable records and references available while reporting conflicting workflow values", async () => {
    const state = learningBackupFixture();
    state.submissions[0].text = "PRIVATE CONFLICTING TEXT";
    state.submissions[0].attemptCount = 3;
    state.submissions[0].attempts![0].reviewedAt = "2026-10-28T13:00";
    state.save(); const before = JSON.stringify(state.archive);
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 6, invalid: 0, errors: 3 });
    for (const code of ["latest-attempt-mismatch", "attempt-count-mismatch", "attempt-review-time-1"]) expect(review.issues).toContainEqual(expect.objectContaining({ kind: "submissions", referenceId: "answer-1", code, level: "error" }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
    expect(JSON.stringify(state.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
});
