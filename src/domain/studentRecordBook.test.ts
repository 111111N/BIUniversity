import { describe, expect, it } from "vitest";
import type { Assessment, AssessmentAttempt, AssessmentKind } from "./assessmentTypes";
import { buildStudentRecordBook } from "./studentRecordBook";

const attempt = (patch: Partial<AssessmentAttempt> = {}): AssessmentAttempt => ({ id: "attempt", number: 1, kind: "primary", date: "2026-11-06", startsAt: "12:40", teacherId: "teacher", chairId: null, memberIds: [], studentIds: ["student", "peer"], results: [{ studentId: "student", outcome: { status: "graded", grade: 5 } }, { studentId: "peer", outcome: { status: "graded", grade: 2 } }], state: "published", createdAt: "2026-11-05T12:00:00Z", createdBy: "configurator", publishedAt: "2026-11-06T12:00:00Z", publishedBy: "teacher", ...patch });
const assessment = (patch: Partial<Assessment> = {}): Assessment => ({ id: "assessment", title: "Экзамен по теории вероятностей", kind: "exam", subjectId: "subject", subjectName: "Теория вероятностей", groupId: "group", groupName: "112-МКО", period: "Осень", supervisorId: null, recordBook: { semester: 1, hours: 72, category: "required" }, roster: [], attempts: [attempt()], ...patch });
const teachers = [{ id: "teacher", name: "Иванов Иван Иванович" }, { id: "other", name: "Петров Пётр Петрович" }];
describe("student record book projection", () => {
  it("shows real hours, ordinal semester, date, time, mark and appointed teacher", () => {
    expect(buildStudentRecordBook([assessment()], teachers, "student")[0]).toMatchObject({ key: "1", semester: 1, rows: [{ title: "Теория вероятностей", hours: 72, date: "2026-11-06", startsAt: "12:40", teacher: "Иванов Иван Иванович", outcome: { status: "graded", grade: 5 }, section: "exams" }] });
  });
  it.each(["pass", "gradedPass"] as const)("places %s in the pass column", (kind) => {
    expect(buildStudentRecordBook([assessment({ kind })], teachers, "student")[0].rows[0].section).toBe("passes");
  });
  it.each(["exam", "pass", "gradedPass"] as const)("keeps elective %s apart from required classes", (kind) => {
    const row = buildStudentRecordBook([assessment({ kind, recordBook: { semester: 1, hours: 24, category: "elective" } })], teachers, "student")[0].rows[0];
    expect(row.section).toBe("electives"); expect(row.kind).toBe(kind);
  });
  it.each([{ kind: "internship", section: "internships" }, { kind: "coursework", section: "coursework" }, { kind: "thesis", section: "theses" }])("separates $kind", ({ kind, section }) => {
    expect(buildStudentRecordBook([assessment({ kind: kind as AssessmentKind })], teachers, "student")[0].rows[0].section).toBe(section);
  });
  it("uses the latest published personal attempt while ignoring a newer draft and another student's attempt", () => {
    const data = assessment({ attempts: [attempt(), attempt({ number: 2, kind: "retake", teacherId: "other", results: [{ studentId: "student", outcome: { status: "graded", grade: 3 } }] }), attempt({ number: 3, kind: "commission", studentIds: ["peer"], results: [{ studentId: "peer", outcome: { status: "graded", grade: 4 } }] }), attempt({ number: 4, state: "draft", results: [{ studentId: "student", outcome: { status: "graded", grade: 2 } }] })] });
    const before = structuredClone(data);
    const row = buildStudentRecordBook([data], teachers, "student")[0].rows[0];
    expect(row).toMatchObject({ outcome: { status: "graded", grade: 3 }, teacher: "Петров Пётр Петрович", attemptNumber: 2, attempts: 2 });
    expect(JSON.stringify(row)).not.toContain("peer"); expect(data).toEqual(before);
  });
  it("sorts semesters numerically and preserves unclassified legacy records without invented defaults", () => {
    const result = buildStudentRecordBook([assessment({ id: "ten", recordBook: { semester: 10, hours: 36, category: "required" } }), assessment({ id: "old", recordBook: null }), assessment({ id: "two", recordBook: { semester: 2, hours: 0, category: "required" } })], [], "student");
    expect(result.map((entry) => entry.key)).toEqual(["2", "10", "unassigned"]);
    expect(result[2].rows[0]).toMatchObject({ semester: null, hours: null, teacher: null });
    expect(result[0].rows[0].hours).toBe(0);
  });
  it("does not fabricate rows for drafts, missing marks, a different participant or unknown students", () => {
    expect(buildStudentRecordBook([assessment({ attempts: [attempt({ state: "draft" })] }), assessment({ attempts: [attempt({ results: [{ studentId: "student", outcome: null }] })] })], teachers, "student")).toEqual([]);
    expect(buildStudentRecordBook([assessment()], teachers, "unrelated")).toEqual([]);
  });
});
