import { describe, expect, it } from "vitest";
import { assessmentBackupFixture } from "../testSupport/assessmentBackup";
import { backupTime } from "../testSupport/localBackup";
import { inspectAssessmentDependencies } from "./assessmentDependencies";
import { queryAdministrationChecks } from "./administrationChecks";
import { decodeAssessmentDocument } from "./assessments";
import type { AssessmentKind } from "./assessmentTypes";

const fixture = (kind: AssessmentKind = "exam", commission = false) => {
  const state = assessmentBackupFixture(kind, commission);
  const sources = { accounts: state.accounts.accounts, groups: state.groups.groups, subjects: state.subjects.subjects };
  return { ...state, sources, read: () => inspectAssessmentDependencies(state.document, sources) };
};
const draft = (state: ReturnType<typeof fixture>) => {
  const attempt = state.document.assessments[0].attempts.at(-1)!;
  attempt.state = "draft"; attempt.publishedBy = null; attempt.publishedAt = null;
  attempt.results = attempt.studentIds.map((studentId) => ({ studentId, outcome: null }));
  state.document.history = state.document.history.filter((entry) => entry.attemptId !== attempt.id || ["created", "attempt-created"].includes(entry.action));
  state.document.revision = state.document.history.length;
  return attempt;
};

describe("assessment dependencies in administrative checks", () => {
  it.each<AssessmentKind>(["exam", "pass", "gradedPass", "internship", "thesis", "coursework"])("keeps valid %s documents unchanged", (kind) => {
    const state = fixture(kind); const before = JSON.stringify(state.document);
    expect(state.read()).toEqual([]); expect(JSON.stringify(state.document)).toBe(before);
  });
  it("checks missing catalog and account IDs across the frozen roster, commission and history without matching names", () => {
    const state = fixture("thesis", true);
    state.sources.groups = []; state.sources.subjects = []; state.sources.accounts = [];
    const rows = state.read();
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(rows.every((row) => row.kind === "assessment-dependency" && row.level === "action" && row.assessmentId === state.document.assessments[0].id)).toBe(true);
    expect(rows.every((row) => row.groupId === undefined && row.subjectId === undefined)).toBe(true);
    state.sources.accounts = state.accounts.accounts.map((account) => ({ ...account, id: `different-${account.id}` }));
    expect(state.read().length).toBe(rows.length);
  });
  it("finds missing historical actors even when they are not current attempt participants", () => {
    const state = fixture();
    state.document.history.push({ id: "metadata-change", assessmentId: state.document.assessments[0].id, attemptId: state.document.assessments[0].attempts[0].id, actorId: "former-config", action: "record-book-updated", occurredAt: backupTime, results: null, recordBook: { semester: 2, hours: 72, category: "required" } });
    state.document.revision++; state.document.assessments[0].recordBook!.semester = 2;
    expect(() => decodeAssessmentDocument(JSON.stringify(state.document))).not.toThrow();
    expect(state.read()).toEqual([expect.objectContaining({ detail: expect.stringContaining("former-config") })]);
  });
  it.each(["blocked", "changed-role"])("reports a %s teacher while the uncompleted statement still needs publication", (change) => {
    const state = fixture("coursework"); const attempt = draft(state);
    const teacher = state.sources.accounts.find((account) => account.id === "teacher-1")!;
    if (change === "blocked") teacher.status = "blocked"; else teacher.role = "student";
    expect(state.read()).toEqual([expect.objectContaining({ level: "action", accountId: teacher.id, assessmentId: state.document.assessments[0].id, attemptId: attempt.id, lessonDate: attempt.date, detail: expect.stringContaining("не может заполнить") })]);
    expect(() => decodeAssessmentDocument(JSON.stringify(state.document))).not.toThrow();
  });
  it("does not reinterpret published results after roles, names, groups, enrollment and access change", () => {
    const state = fixture("thesis", true);
    for (const account of state.sources.accounts) { account.status = "blocked"; account.role = "configurator"; account.name = "Новое имя"; account.memberships = []; account.studentGroupId = undefined; account.enrollmentStatus = "graduated"; }
    state.sources.groups[0].status = "archived";
    expect(state.read()).toEqual([]);
    expect(state.document.assessments[0].attempts[0].results[0].outcome).toEqual({ status: "graded", grade: 5 });
  });
  it("keeps transferred or graduated students in a draft and does not derive assessment access from lesson memberships", () => {
    const state = fixture(); draft(state);
    const student = state.sources.accounts.find((account) => account.id === "student-1")!;
    student.status = "blocked"; student.studentGroupId = "another"; student.enrollmentStatus = "graduated";
    for (const account of state.sources.accounts) account.memberships = [];
    expect(state.read()).toEqual([]);
  });
  it("flags archived groups and changed commission accounts for manual review only in uncompleted attempts", () => {
    const state = fixture("exam", true); const attempt = draft(state);
    state.sources.groups[0].status = "archived";
    state.sources.accounts.find((account) => account.id === "chair")!.status = "blocked";
    const before = JSON.stringify(state.document);
    const rows = state.read();
    expect(rows).toHaveLength(2); expect(rows.every((row) => row.level === "review" && row.attemptId === attempt.id)).toBe(true);
    expect(rows.every((row) => row.groupArchived && row.groupId === "group-1")).toBe(true);
    expect(JSON.stringify(state.document)).toBe(before);
  });
  it("accepts an explicitly absent optional discipline for internships", () => {
    const state = fixture("internship"); state.document.assessments[0].subjectId = null; state.document.assessments[0].subjectName = null;
    state.sources.subjects = [];
    expect(state.read()).toEqual([]);
  });
  it("paginates assessment findings, preserves global counts under search and handles IDs containing separators", () => {
    const state = fixture();
    state.document.assessments = Array.from({ length: 100 }, (_, index) => ({ ...structuredClone(state.document.assessments[0]), id: `assessment:${index}`, title: `Экзамен ${index}`, groupId: `missing:${index}` }));
    const before = JSON.stringify(state.document);
    const query = { q: "", kind: "assessment-dependency", level: "action", page: 2 };
    const result = queryAdministrationChecks(state.sources.accounts, state.groups.groups, state.subjects.subjects, [], query, backupTime, state.document);
    expect(result).toMatchObject({ total: 100, page: 2, pages: 5 }); expect(result.rows).toHaveLength(20); expect(result.kinds["assessment-dependency"]).toBe(100);
    const filtered = queryAdministrationChecks(state.sources.accounts, state.groups.groups, state.subjects.subjects, [], { ...query, q: "Экзамен 99" }, backupTime, state.document);
    expect(filtered).toMatchObject({ total: 1, page: 1 }); expect(filtered.counts).toEqual(result.counts); expect(filtered.kinds).toEqual(result.kinds);
    expect(JSON.stringify(state.document)).toBe(before);
  });
});
