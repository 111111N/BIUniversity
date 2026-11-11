import { describe, expect, it } from "vitest";
import { assessmentCorrectionFixture } from "../testSupport/assessmentCorrections";
import { decodeAssessmentDocument, projectAssessments } from "./assessments";
import { assessmentPublication } from "./assessmentCorrections";
import { createAssessmentStatement } from "./assessmentExport";
import { buildStudentRecordBook } from "./studentRecordBook";
import type { AssessmentKind } from "./assessmentTypes";
import { compareBackupAssessmentRecords, assertCompleteAssessmentComparison } from "./backupAssessmentComparison";
import { readBackupRecordPreview } from "./backupRecordPreview";
import { ASSESSMENTS_STORAGE_KEY } from "./assessmentTypes";
import { inspectBackupAssessments } from "./backupAssessmentDocuments";
import { backupTime } from "../testSupport/localBackup";
import { inspectAssessmentDependencies } from "./assessmentDependencies";

describe("authorized corrections of published assessment results", () => {
  it.each<AssessmentKind>(["exam", "pass", "gradedPass", "internship", "thesis", "coursework"])("publishes a new %s version without changing the original publication or creating a retake", (kind) => {
    const { initial, source, ids, open, save, publish } = assessmentCorrectionFixture(kind);
    const original = JSON.stringify(initial); const student = source.accounts.accounts.find((account) => account.id === "student-1")!;
    const opened = open(); const saved = save(opened);
    expect(projectAssessments(saved, student)[0].attempts[0].results[0].outcome).toEqual(initial.assessments[0].attempts[0].results[0].outcome);
    const result = publish(saved);
    expect(result.assessments).toEqual(initial.assessments); expect(result.history).toEqual(initial.history);
    expect(result.corrections[0]).toMatchObject({ version: 2, state: "published", openedBy: "configurator-demo", publishedBy: "teacher-1", ...ids });
    expect(result.assessments[0].attempts).toHaveLength(1);
    expect(projectAssessments(result, student)[0].attempts[0].results[0].outcome).toEqual(kind === "pass" ? { status: "failed" } : { status: "graded", grade: 2 });
    expect(JSON.stringify(projectAssessments(result, student))).not.toContain("PRIVATE CORRECTION REASON");
    expect(result.revision).toBe(result.history.length + result.correctionHistory.length);
    expect(decodeAssessmentDocument(JSON.stringify(result))).toEqual(result); expect(JSON.stringify(initial)).toBe(original);
  });
  it("retains all published versions and starts each new correction from the latest effective result", () => {
    const { initial, attempt, open, save, publish } = assessmentCorrectionFixture();
    const version2 = publish(save(open())); const previous = JSON.stringify(version2.corrections[0]);
    const next = open(version2); expect(next.corrections[1].results).toEqual(version2.corrections[0].results);
    const version3 = publish(save(next, { status: "graded", grade: 4 }));
    expect(JSON.stringify(version3.corrections[0])).toBe(previous);
    expect([1, 2, 3].map((version) => assessmentPublication(version3, attempt, version).results[0].outcome)).toEqual([{ status: "graded", grade: 5 }, { status: "graded", grade: 2 }, { status: "graded", grade: 4 }]);
    expect(assessmentPublication(version3, attempt).version).toBe(3); expect(initial.assessments[0].attempts[0].number).toBe(1);
    expect(() => assessmentPublication(version3, attempt, 4)).toThrow("недоступна");
  });
  it("preserves the later retake as the record-book result when an earlier publication is corrected", () => {
    const { initial, source, run, open, save, publish, attempt } = assessmentCorrectionFixture();
    let state = run(initial, { type: "add-attempt", assessmentId: initial.assessments[0].id, kind: "retake", draft: { date: attempt.date, startsAt: attempt.startsAt, room: "202", teacherId: "teacher-1", chairId: null, memberIds: [], studentIds: ["student-1"] } });
    const ids = { assessmentId: state.assessments[0].id, attemptId: state.assessments[0].attempts[1].id };
    state = run(state, { type: "save-results", ...ids, results: [{ studentId: "student-1", outcome: { status: "graded", grade: 4 } }] }, "teacher-1");
    state = run(state, { type: "publish", ...ids }, "teacher-1");
    const corrected = publish(save(open(state)));
    const student = source.accounts.accounts.find((account) => account.id === "student-1")!;
    const book = buildStudentRecordBook(projectAssessments(corrected, student), [], student.id);
    expect(book[0].rows[0].outcome).toEqual({ status: "graded", grade: 4 });
    expect(corrected.assessments[0].attempts).toEqual(state.assessments[0].attempts);
  });
  it("flags a blocked responsible teacher for an active correction without applying current committee roles to a historical publication", () => {
    const { source, initial, open } = assessmentCorrectionFixture("exam", true);
    const accounts = structuredClone(source.accounts.accounts);
    for (const id of ["teacher-1", "chair", "member"]) accounts.find((row) => row.id === id)!.status = "blocked";
    const sources = { accounts, groups: source.groups.groups, subjects: source.subjects.subjects };
    expect(inspectAssessmentDependencies(initial, sources)).toEqual([]);
    const issues = inspectAssessmentDependencies(open(), sources);
    expect(issues.some((issue) => issue.accountId === "teacher-1" && issue.level === "action")).toBe(true);
    expect(issues.some((issue) => issue.detail.includes("председателя"))).toBe(false);
  });
  it.each(["teacher-1", "student-1", "chair"])("does not let %s authorize a correction", (actorId) => {
    const { initial, ids, run } = assessmentCorrectionFixture();
    expect(() => run(initial, { type: "open-correction", ...ids, reason: "Исправление" }, actorId)).toThrow("только настройщик");
  });
  it.each(["configurator-demo", "student-1", "chair", "member"])("does not let %s fill or publish the assigned teacher's correction", (actorId) => {
    const { ids, run, open } = assessmentCorrectionFixture("thesis", true); const state = open();
    expect(() => run(state, { type: "save-correction", ...ids, correctionId: state.corrections[0].id, results: state.corrections[0].results }, actorId)).toThrow("назначенный преподаватель");
    expect(() => run(state, { type: "publish-correction", ...ids, correctionId: state.corrections[0].id }, actorId)).toThrow("назначенный преподаватель");
  });
  it.each(["", " ", "x", "x".repeat(501), "Причина\nдругая", " причина "])("requires a valid explicit reason %j", (reason) => {
    const { initial, ids, run } = assessmentCorrectionFixture();
    expect(() => run(initial, { type: "open-correction", ...ids, reason })).toThrow("причину");
  });
  it("allows only one active correction and rejects unapproved, closed, empty or unchanged publications", () => {
    const { initial, ids, run, open, save, publish } = assessmentCorrectionFixture();
    expect(() => run(initial, { type: "save-correction", ...ids, correctionId: "missing", results: [] }, "teacher-1")).toThrow("недоступен");
    const opened = open(); expect(() => open(opened)).toThrow("незавершённое"); expect(() => publish(opened)).toThrow("не изменились");
    expect(() => publish(save(opened, null))).toThrow("каждого участника");
    const published = publish(save(opened)); expect(() => save(published)).toThrow("уже опубликован");
    expect(() => run(opened, { type: "save-correction", ...ids, correctionId: opened.corrections[0].id, results: [{ studentId: "foreign", outcome: null }] }, "teacher-1")).toThrow("лишнего");
  });
  it("requires a published target and rejects timestamps before publication", () => {
    const { initial, ids, run, open } = assessmentCorrectionFixture();
    const draft = structuredClone(initial); draft.history = draft.history.slice(0, 1); draft.revision = 1;
    Object.assign(draft.assessments[0].attempts[0], { state: "draft", publishedAt: null, publishedBy: null, results: [{ studentId: "student-1", outcome: null }] });
    expect(() => run(draft, { type: "open-correction", ...ids, reason: "Проверка" })).toThrow("опубликованной");
    expect(() => run(initial, { type: "open-correction", ...ids, reason: "Проверка" }, "configurator-demo", "2026-10-28T08:59:59Z")).toThrow("порядок истории");
    expect(open().corrections[0].openedAt).toBe(backupTime);
  });
  it.each(["missing-open", "wrong-actor", "changed-reason", "changed-result", "missing-publication", "wrong-version", "wrong-revision"])("rejects tampered correction history: %s", (mode) => {
    const { open, save, publish } = assessmentCorrectionFixture(); const state = publish(save(open()));
    if (mode === "missing-open") { state.correctionHistory.shift(); state.revision -= 1; }
    if (mode === "wrong-actor") state.correctionHistory[1].actorId = "configurator-demo";
    if (mode === "changed-reason") state.corrections[0].reason = "Другая причина";
    if (mode === "changed-result") state.corrections[0].results[0].outcome = { status: "graded", grade: 4 };
    if (mode === "missing-publication") { state.correctionHistory.pop(); state.revision -= 1; }
    if (mode === "wrong-version") state.corrections[0].version = 3;
    if (mode === "wrong-revision") state.revision += 1;
    expect(() => decodeAssessmentDocument(JSON.stringify(state))).toThrow();
  });
  it("migrates a strict v3 document without rewriting original values or marking its recorded assignments as inferred", () => {
    const { initial } = assessmentCorrectionFixture();
    const legacy = { version: 3, revision: initial.revision, assessments: initial.assessments, history: initial.history }; const raw = JSON.stringify(legacy);
    expect(decodeAssessmentDocument(raw)).toEqual(initial); expect(JSON.stringify(legacy)).toBe(raw);
  });
  it("exports an explicitly selected original or corrected version and updates the student's record book only after publication", () => {
    const { initial, attempt, context, ids, open, save, publish, source } = assessmentCorrectionFixture();
    const draft = save(open()); const published = publish(draft); const student = source.accounts.accounts.find((row) => row.id === "student-1")!;
    expect(JSON.stringify(buildStudentRecordBook(projectAssessments(draft, student), [], "student-1"))).toContain('"grade":5');
    expect(JSON.stringify(buildStudentRecordBook(projectAssessments(published, student), [], "student-1"))).toContain('"grade":2');
    const request = { actorId: "configurator-demo", actorRevision: 1, expectedRevision: published.revision, accountsRevision: 1, groupRevision: 1, subjectRevision: 1, ...ids };
    const latest = createAssessmentStatement(published, request, context); const original = createAssessmentStatement(published, { ...request, version: 1 }, context);
    expect(latest.filename).toContain("-v2.csv"); expect(original.filename).toContain("-v1.csv"); expect(latest.csv).not.toBe(original.csv);
    expect(assessmentPublication(published, attempt, 1).results).toEqual(initial.assessments[0].attempts[0].results);
  });
  it("checks correction authors and dates in archives and compares corrections and their audit separately", async () => {
    const { initial, source, open, save, publish } = assessmentCorrectionFixture(); const state = publish(save(open()));
    const entry = { key: ASSESSMENTS_STORAGE_KEY, raw: JSON.stringify(state) };
    const review = await compareBackupAssessmentRecords([{ ...entry, raw: JSON.stringify(initial) }], [entry]);
    expect(review.assessments.counts.same).toBe(1); expect(review.corrections?.counts.currentOnly).toBe(1); expect(review.correctionHistory?.counts.currentOnly).toBe(3);
    expect(() => assertCompleteAssessmentComparison(review)).not.toThrow();
    const other = structuredClone(state); other.corrections[0].reason = "PRIVATE OTHER REASON"; other.correctionHistory[0].reason = "PRIVATE OTHER REASON";
    const differences = await compareBackupAssessmentRecords([entry], [{ ...entry, raw: JSON.stringify(other) }]);
    const preview = await readBackupRecordPreview([entry], [{ ...entry, raw: JSON.stringify(other) }], differences.corrections!.differences[0]);
    expect(preview.rows[0].label).toBe("Причина исправления"); expect(JSON.stringify(differences)).not.toContain("PRIVATE");
    const sources = { ...source.sources, accountIds: new Set([...source.sources.accountIds].filter((id) => id !== "configurator-demo")) };
    const check = await inspectBackupAssessments([entry], sources, "2026-10-28T09:30:00Z");
    expect(check.issues.some((issue) => issue.code === "missing-assessment-account")).toBe(true);
    expect(check.issues.some((issue) => issue.code.includes("after"))).toBe(true);
  });
});
