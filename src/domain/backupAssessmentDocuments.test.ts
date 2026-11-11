import { afterEach, describe, expect, it, vi } from "vitest";
import { assessmentBackupFixture } from "../testSupport/assessmentBackup";
import { backupTime } from "../testSupport/localBackup";
import { ASSESSMENTS_STORAGE_KEY, type AssessmentDocument, type AssessmentKind } from "./assessmentTypes";
import { assessmentAttemptAssignment, decodeAssessmentDocument, emptyAssessmentDocument } from "./assessments";
import { inspectBackupAssessments } from "./backupAssessmentDocuments";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { assessBackupRestoreAdmission } from "./backupRestoreAdmission";

afterEach(() => vi.unstubAllGlobals());
const entries = (document: AssessmentDocument) => [{ key: ASSESSMENTS_STORAGE_KEY, raw: JSON.stringify(document) }];

describe("archived assessment documents", () => {
  it.each<AssessmentKind>(["exam", "pass", "gradedPass", "internship", "thesis", "coursework"])("checks %s without reading live stores or exposing content", async (kind) => {
    const fixture = assessmentBackupFixture(kind);
    const before = JSON.stringify(fixture.archive);
    const forbidden = vi.fn(() => { throw new Error("Live storage is forbidden"); });
    vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden });
    const review = await inspectBackupAssessments(fixture.archive.localStorage, fixture.sources, backupTime);
    expect(review.checks).toEqual([expect.objectContaining({ kind: "assessments", status: "valid", revision: 3, records: 1 })]);
    expect(review.issues.map((issue) => issue.code)).toEqual(["unconfirmed-assessment-authority", "unconfirmed-assessment-period"]);
    expect(forbidden).not.toHaveBeenCalled(); expect(JSON.stringify(fixture.archive)).toBe(before);
    for (const secret of ["PRIVATE", "Смирнова", "Петров"]) expect(JSON.stringify(review)).not.toContain(secret);
  });
  it("reads v1 in memory without adding invented record-book metadata or rewriting the archive", async () => {
    const fixture = assessmentBackupFixture();
    const legacy = { version: 1, revision: fixture.document.revision, assessments: fixture.document.assessments.map(({ recordBook: _recordBook, ...assessment }) => assessment), history: fixture.document.history.map(({ recordBook: _recordBook, assignment: _assignment, ...entry }) => entry) };
    const rows = [{ key: ASSESSMENTS_STORAGE_KEY, raw: JSON.stringify(legacy) }]; const before = rows[0].raw;
    expect(decodeAssessmentDocument(before).assessments[0].recordBook).toBeNull();
    expect((await inspectBackupAssessments(rows, fixture.sources, backupTime)).checks[0].status).toBe("valid");
    expect(rows[0].raw).toBe(before);
  });
  it("distinguishes absent and strictly empty documents without inventing dependencies", async () => {
    expect((await inspectBackupAssessments([], {}, backupTime)).checks[0].status).toBe("absent");
    const review = await inspectBackupAssessments(entries(emptyAssessmentDocument()), {}, backupTime);
    expect(review.checks[0]).toMatchObject({ status: "valid", revision: 0, records: 0 }); expect(review.issues).toEqual([]);
  });
  it.each(["grade", "history", "duplicate", "version", "json"])("rejects damaged %s without losing the source or leaking JSON snippets", async (damage) => {
    const fixture = assessmentBackupFixture(); const document = fixture.document;
    if (damage === "grade") document.assessments[0].attempts[0].results[0].outcome = { status: "graded", grade: 7 } as never;
    if (damage === "history") document.history.pop();
    if (damage === "duplicate") document.assessments.push(structuredClone(document.assessments[0]));
    const rows = entries(document);
    if (damage === "version") rows[0].raw = JSON.stringify({ ...document, version: 99 });
    if (damage === "json") rows[0].raw = '{"PRIVATE SECRET": malformed';
    const before = rows[0].raw;
    const review = await inspectBackupAssessments(rows, fixture.sources, backupTime);
    expect(review.checks[0].status).toBe("invalid"); expect(review.issues).toContainEqual(expect.objectContaining({ level: "error", code: "invalid-document" }));
    expect(rows[0].raw).toBe(before); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it.each([true, false])("rejects unsupported keys regardless of ordering (future first: %s), while checking the readable source", async (futureFirst) => {
    const fixture = assessmentBackupFixture(); fixture.sources.groupIds.clear();
    const current = entries(fixture.document)[0]; const future = { key: "bi-university-assessments-v99", raw: "PRIVATE" };
    const review = await inspectBackupAssessments(futureFirst ? [future, current] : [current, future], fixture.sources, backupTime);
    expect(review.checks[0]).toMatchObject({ status: "invalid", documents: 2 });
    expect(review.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "unsupported-assessment-key" }), expect.objectContaining({ code: "missing-assessment-group" })]));
  });
  it("does not merge duplicate document keys", async () => {
    const row = entries(emptyAssessmentDocument())[0];
    const review = await inspectBackupAssessments([row, row], {}, backupTime);
    expect(review.checks[0].status).toBe("invalid"); expect(review.issues[0].code).toBe("unsupported-assessment-key");
  });
  it("distinguishes unavailable catalog sources from known missing targets", async () => {
    const fixture = assessmentBackupFixture("thesis", true);
    const unknown = await inspectBackupAssessments(entries(fixture.document), {}, backupTime);
    expect(unknown.issues.every((issue) => issue.level === "review")).toBe(true);
    for (const target of ["account", "group", "subject"]) expect(unknown.issues.some((issue) => issue.code === `unchecked-assessment-${target}`)).toBe(true);
    const missing = await inspectBackupAssessments(entries(fixture.document), { accountIds: new Set(), groupIds: new Set(), subjectIds: new Set() }, backupTime);
    for (const target of ["account", "group", "subject"]) expect(missing.issues.some((issue) => issue.level === "error" && issue.code === `missing-assessment-${target}`)).toBe(true);
    for (const id of ["student-1", "teacher-1", "configurator-demo", "chair", "member"]) expect(missing.issues).toContainEqual(expect.objectContaining({ level: "error", referenceId: id }));
  });
  it("checks historical actors separately and accepts valid optional subject references", async () => {
    const fixture = assessmentBackupFixture("internship");
    fixture.document.assessments[0].subjectId = null; fixture.document.assessments[0].subjectName = null;
    fixture.document.history.splice(1, 0, { id: "metadata-history", assessmentId: fixture.document.assessments[0].id, attemptId: fixture.document.assessments[0].attempts[0].id, actorId: "former-config", action: "record-book-updated", occurredAt: backupTime, results: null, recordBook: { semester: 2, hours: 72, category: "required" } });
    fixture.document.revision++;
    fixture.document.assessments[0].recordBook!.semester = 2;
    for (const entry of fixture.document.history.slice(2)) entry.recordBook!.semester = 2;
    const review = await inspectBackupAssessments(entries(fixture.document), { ...fixture.sources, subjectIds: undefined }, backupTime);
    expect(review.checks[0].status).toBe("valid");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "missing-assessment-account", referenceId: "former-config", recordId: "metadata-history" }));
    expect(review.issues.some((issue) => issue.code.includes("subject"))).toBe(false);
  });
  it("checks the complete historical roster even for students outside the latest commission attempt", async () => {
    const fixture = assessmentBackupFixture("exam", true);
    const assessment = fixture.document.assessments[0];
    assessment.roster.push({ studentId: "former-student", name: "PRIVATE FORMER STUDENT", studentNumber: null });
    assessment.attempts[0].studentIds.push("former-student");
    fixture.document.history[0].assignment!.studentIds.push("former-student");
    const mark = { studentId: "former-student", outcome: { status: "absent" as const } };
    assessment.attempts[0].results.push(mark);
    for (const entry of fixture.document.history) if (entry.attemptId === assessment.attempts[0].id && entry.results !== null) entry.results.push(structuredClone(mark));
    const review = await inspectBackupAssessments(entries(fixture.document), fixture.sources, backupTime);
    expect(review.checks[0].status).toBe("valid");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "missing-assessment-account", referenceId: "former-student", recordId: assessment.id }));
  });
  it("keeps future appointments valid but rejects saved actions after the archive cutoff", async () => {
    const fixture = assessmentBackupFixture(); const document = fixture.document;
    document.assessments[0].attempts[0] = { ...document.assessments[0].attempts[0], date: "2027-01-01", state: "draft", publishedAt: null, publishedBy: null, results: [{ studentId: "student-1", outcome: null }] };
    document.history = [{ ...document.history[0], assignment: assessmentAttemptAssignment(document.assessments[0].attempts[0]) }]; document.revision = 1;
    expect((await inspectBackupAssessments(entries(document), fixture.sources, backupTime)).issues.some((issue) => issue.code === "assessment-event-after-backup")).toBe(false);
    document.assessments[0].attempts[0].createdAt = "2026-10-29T10:00:00Z"; document.history[0].occurredAt = "2026-10-29T10:00:00Z";
    const review = await inspectBackupAssessments(entries(document), fixture.sources, backupTime);
    expect(review.checks[0].status).toBe("valid"); expect(review.issues.filter((issue) => issue.code === "assessment-event-after-backup")).toHaveLength(2);
    const invalidCutoff = await inspectBackupAssessments(entries(document), fixture.sources, "invalid");
    expect(invalidCutoff.issues.some((issue) => issue.code === "unchecked-assessment-cutoff")).toBe(true);
  });
  it("checks the cutoff of metadata-only audit entries independently of attempt timestamps", async () => {
    const fixture = assessmentBackupFixture();
    fixture.document.history.push({ id: "future-metadata", assessmentId: fixture.document.assessments[0].id, attemptId: fixture.document.assessments[0].attempts[0].id, actorId: "configurator-demo", occurredAt: "2026-10-29T10:00:00Z", action: "record-book-updated", results: null, recordBook: { semester: 2, hours: 72, category: "required" } });
    fixture.document.assessments[0].recordBook!.semester = 2; fixture.document.revision++;
    const review = await inspectBackupAssessments(entries(fixture.document), fixture.sources, backupTime);
    expect(review.checks[0].status).toBe("valid");
    expect(review.issues.filter((issue) => issue.code === "assessment-event-after-backup")).toEqual([expect.objectContaining({ recordId: "future-metadata", level: "error" })]);
  });
  it("does not infer historical membership or access from changed current roles, names, groups or blocked accounts", async () => {
    const fixture = assessmentBackupFixture();
    fixture.accounts.accounts[1].role = "student"; fixture.accounts.accounts[1].memberships = []; fixture.accounts.accounts[1].status = "blocked";
    fixture.accounts.accounts[2].name = "Другое имя"; fixture.accounts.accounts[2].studentGroupId = undefined; fixture.accounts.accounts[2].memberships = [];
    fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    const issues = review.issues.filter((issue) => issue.kind === "assessments");
    expect(issues.some((issue) => issue.level === "error")).toBe(false);
    expect(issues.some((issue) => issue.code === "unconfirmed-assessment-authority")).toBe(true);
    expect(assessBackupRestoreAdmission(review).status).toBe("blocked");
  });
  it("integrates with whole-archive admission and never substitutes baseline/demo groups for archived dependencies", async () => {
    const fixture = assessmentBackupFixture(); fixture.groups.groups = []; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo", { groupIds: ["group-1"], requiredSubjectIds: [] });
    expect(review.uncheckedKeys).not.toContain(ASSESSMENTS_STORAGE_KEY);
    expect(review.issues).toContainEqual(expect.objectContaining({ kind: "assessments", code: "missing-assessment-group", referenceId: "group-1" }));
    expect(assessBackupRestoreAdmission(review)).toMatchObject({ status: "blocked", counts: { "incomplete-review": 0 }, blockers: expect.arrayContaining([expect.objectContaining({ kind: "assessments", code: "missing-assessment-group" })]) });
  });
  it("honors cancellation before and during large reference scans", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(inspectBackupAssessments([], {}, backupTime, controller.signal)).rejects.toThrow();
    const delayed = new AbortController();
    const pending = inspectBackupAssessments(Array.from({ length: 256 }, (_, index) => ({ key: `unrelated-${index}`, raw: "" })), {}, backupTime, delayed.signal);
    setTimeout(() => delayed.abort(), 0);
    await expect(pending).rejects.toThrow();
  });
});
