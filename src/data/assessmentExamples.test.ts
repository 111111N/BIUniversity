import { describe, expect, it } from "vitest";
import { createAssessmentExamples } from "./assessmentExamples";
import { decodeAssessmentDocument } from "../domain/assessments";
import { buildStudentRecordBook } from "../domain/studentRecordBook";
import type { AssessmentHistoryEntry } from "../domain/assessmentTypes";

describe("isolated examples across four academic years", () => {
  it("fills eight semesters with all assessment kinds, separate electives and varied results", () => {
    const data = createAssessmentExamples("viewer");
    expect(data.assessments).toHaveLength(56);
    expect([...new Set(data.assessments.map((entry) => entry.kind))].sort()).toEqual(["coursework", "exam", "gradedPass", "internship", "pass", "thesis"]);
    const book = buildStudentRecordBook(data.assessments, data.teachers, "viewer");
    expect(book.map((semester) => semester.semester)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(book.every((semester) => ["passes", "exams", "electives"].every((section) => semester.rows.some((row) => row.section === section)))).toBe(true);
    expect(data.assessments.some((entry) => entry.attempts.some((attempt) => attempt.kind === "commission"))).toBe(true);
    expect(new Set(data.assessments.flatMap((entry) => entry.attempts.flatMap((attempt) => attempt.results.map((row) => row.outcome?.status))))).toEqual(new Set(["graded", "passed", "failed", "absent"]));
  });
  it("has valid appointment times, attempts, commissions, supervisors and auditable results", () => {
    const { assessments } = createAssessmentExamples("viewer");
    const history: AssessmentHistoryEntry[] = assessments.flatMap((assessment) => assessment.attempts.flatMap((attempt) => {
      const shared = { assessmentId: assessment.id, attemptId: attempt.id, recordBook: assessment.recordBook };
      return [
        { ...shared, id: `${attempt.id}-created`, actorId: attempt.createdBy, occurredAt: attempt.createdAt, action: attempt.number === 1 ? "created" as const : "attempt-created" as const, results: null },
        { ...shared, id: `${attempt.id}-saved`, actorId: attempt.teacherId, occurredAt: new Date(Date.parse(attempt.publishedAt!) - 1000).toISOString(), action: "results-saved" as const, results: attempt.results },
        { ...shared, id: `${attempt.id}-published`, actorId: attempt.teacherId, occurredAt: attempt.publishedAt!, action: "published" as const, results: attempt.results },
      ];
    })).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    expect(() => decodeAssessmentDocument(JSON.stringify({ version: 2, revision: history.length, assessments, history }))).not.toThrow();
    expect(assessments.flatMap((entry) => entry.attempts).every((attempt) => attempt.publishedAt! < "2026-11-06T00:00:00.000Z")).toBe(true);
  });
  it("is deterministic, detached, tied to the viewer and does not need storage", () => {
    const first = createAssessmentExamples("first"); const second = createAssessmentExamples("second");
    expect(first.assessments.every((entry) => entry.attempts.every((attempt) => attempt.studentIds[0] === "first"))).toBe(true);
    expect(second.assessments.every((entry) => entry.attempts.every((attempt) => attempt.studentIds[0] === "second"))).toBe(true);
    first.assessments[0].title = "Изменено"; first.teachers[0].name = "Изменено";
    expect(createAssessmentExamples("first").assessments[0].title).toBe("Математический анализ");
    expect(createAssessmentExamples("first").teachers[0].name).toBe("Иванов Иван Иванович");
  });
});
