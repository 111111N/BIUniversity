import { describe, expect, it } from "vitest";
import { getSemesterHours, getSemesterSubjects, getSubjectHours, STUDY_PLAN_TOTAL_HOURS } from "./studyPlan";

describe("study plan", () => {
  it("calculates subject and semester hours from workload types", () => {
    const subject = getSemesterSubjects(3)[0];
    expect(getSubjectHours(subject)).toBe(subject.lectures + subject.practice + subject.labs + subject.independent);
    expect(getSemesterHours(3)).toBe(STUDY_PLAN_TOTAL_HOURS);
  });

  it("keeps subjects isolated by semester", () => {
    expect(getSemesterSubjects(3).every((subject) => subject.semester === 3)).toBe(true);
    expect(getSemesterSubjects(4).every((subject) => subject.semester === 4)).toBe(true);
  });
});
