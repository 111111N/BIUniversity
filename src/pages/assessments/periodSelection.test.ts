import { describe, expect, it } from "vitest";
import { academicPeriodsFixture } from "../../testSupport/academicPeriods";
import type { AssessmentDraft } from "../../domain/assessmentTypes";
import { reviewAssessmentPeriodSelection } from "./periodSelection";

const draft: AssessmentDraft = { title: "Мой несохранённый ввод", kind: "exam", groupId: "group", subjectId: "subject", period: "Old label", academicPeriod: { termId: "term-autumn", expectedRevision: 1 },
  recordBook: { semester: 7, hours: 72, category: "required" }, attempt: { date: "2027-02-20", startsAt: "12:00", teacherId: "teacher", chairId: null, memberIds: [], studentIds: ["student"] } };
describe("assessment calendar review", () => {
  it("explicitly refreshes period label and revision while preserving all other input", () => {
    const periods = academicPeriodsFixture(), before = JSON.stringify(draft), reviewed = reviewAssessmentPeriodSelection(draft, "year-2026", periods);
    expect(reviewed.draft).toEqual({ ...draft, period: "2026/2027 · осенний семестр", academicPeriod: { termId: "term-autumn", expectedRevision: 2 } });
    expect(reviewed.draft.recordBook?.semester).toBe(7); expect(reviewed.draft.attempt.date).toBe("2027-02-20"); expect(reviewed.warning).toBe(""); expect(JSON.stringify(draft)).toBe(before);
  });
  it.each(["removed-year", "removed-term", "moved-term"])("clears an unavailable selection with a warning, preserving the rest: %s", mode => {
    const periods = academicPeriodsFixture();
    if (mode === "removed-year") periods.years = [];
    if (mode === "removed-term") periods.terms = [];
    if (mode === "moved-term") periods.terms[0].yearId = "other-year";
    const reviewed = reviewAssessmentPeriodSelection(draft, "year-2026", periods);
    expect(reviewed.draft).toEqual({ ...draft, period: "", academicPeriod: undefined }); expect(reviewed.warning).toContain("Остальной ввод сохранён");
    expect(reviewed.yearId).toBe(mode === "removed-year" ? "" : "year-2026");
  });
  it("does not infer a term when none was chosen and handles a disappeared year", () => {
    const periods = academicPeriodsFixture(), input = { ...draft, period: "", academicPeriod: undefined };
    expect(reviewAssessmentPeriodSelection(input, "year-2026", periods).draft.academicPeriod).toBeUndefined();
    periods.years = []; expect(reviewAssessmentPeriodSelection(input, "year-2026", periods).yearId).toBe("");
  });
  it("keeps input intact when the source is unavailable", () => {
    const before = JSON.stringify(draft);
    for (const periods of [undefined, { revision: 0, years: [], terms: [], error: "Не читается календарь" }]) expect(() => reviewAssessmentPeriodSelection(draft, "year-2026", periods)).toThrow();
    expect(JSON.stringify(draft)).toBe(before);
  });
});
