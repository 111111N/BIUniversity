import { describe, expect, it } from "vitest";
import type { AssessmentOutcome, AssessmentResult } from "../../domain/assessmentTypes";
import { reconcileAssessmentResults } from "./resultReconciliation";

const grade = (value: 2 | 3 | 4 | 5): AssessmentOutcome => ({ status: "graded", grade: value });
const rows = (first: AssessmentOutcome | null, second: AssessmentOutcome | null = null): AssessmentResult[] => [{ studentId: "first", outcome: first }, { studentId: "second", outcome: second }];
describe("assessment result reconciliation after an external write", () => {
  it("keeps independent local changes while accepting untouched rows from the latest saved version", () => {
    expect(reconcileAssessmentResults(rows(null), rows(grade(4)), rows(null, grade(3)))).toEqual({ results: rows(grade(4), grade(3)), conflicts: [] });
  });
  it("requires an explicit choice for competing edits of the same student", () => {
    expect(reconcileAssessmentResults(rows(grade(2)), rows(grade(5)), rows({ status: "absent" }))).toEqual({ results: rows(grade(5)), conflicts: [{ studentId: "first", local: grade(5), saved: { status: "absent" } }] });
  });
  it("accepts matching changes without creating a false conflict", () => {
    expect(reconcileAssessmentResults(rows(null), rows({ status: "passed" }), rows({ status: "passed" }))).toEqual({ results: rows({ status: "passed" }), conflicts: [] });
  });
  it("distinguishes clearing a mark from a different saved result", () => {
    const outcome = reconcileAssessmentResults(rows({ status: "failed" }), rows(null), rows({ status: "passed" }));
    expect(outcome.conflicts).toEqual([{ studentId: "first", local: null, saved: { status: "passed" } }]);
  });
  it.each([
    rows(null).slice(1), [...rows(null), { studentId: "extra", outcome: null }],
    [{ studentId: "first", outcome: null }, { studentId: "first", outcome: null }],
    [{ studentId: "first", outcome: null }, { studentId: "unrelated", outcome: null }],
  ].map((latest) => ({ latest })))("does not rebase across missing, extra or duplicated students %#", ({ latest }) => {
    expect(() => reconcileAssessmentResults(rows(null), rows(grade(5)), latest)).toThrow(/Состав/);
  });
  it("matches by student ID, preserves latest ordering and detaches all returned values", () => {
    const base = rows(null, grade(3)); const local = rows(grade(5), grade(3)); const latest = rows(null, grade(4)).reverse();
    const before = structuredClone({ base, local, latest });
    const result = reconcileAssessmentResults(base, local, latest);
    expect(result.results).toEqual(rows(grade(5), grade(4)).reverse());
    result.results[0].outcome = null;
    expect({ base, local, latest }).toEqual(before);
  });
});
