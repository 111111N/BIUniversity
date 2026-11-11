import { describe, expect, it } from "vitest";
import { assessmentBackupFixture } from "../../testSupport/assessmentBackup";
import { requireUnchangedAttemptSource } from "./attemptRefresh";
import type { Assessment } from "../../domain/assessmentTypes";

const source = () => assessmentBackupFixture().document.assessments[0];

describe("retake source revalidation", () => {
  it("accepts unrelated document changes and independently edited record-book metadata without mutating the draft source", () => {
    const original = source(); const before = JSON.stringify(original);
    const next = structuredClone(original); next.recordBook = { semester: 4, hours: 108, category: "elective" };
    expect(() => requireUnchangedAttemptSource(original, next)).not.toThrow();
    expect(JSON.stringify(original)).toBe(before);
  });
  it("rejects a new attempt that was created and published while this form remained open", () => {
    const original = source(); const next = assessmentBackupFixture("exam", true).document.assessments[0];
    expect(next.attempts.at(-1)?.state).toBe("published");
    expect(() => requireUnchangedAttemptSource(original, next)).toThrow("история попыток");
  });
  it.each<(value: Assessment) => void>([
    (value) => { value.id = "another-assessment"; },
    (value) => { value.groupId = "another-group"; },
    (value) => { value.subjectId = "another-subject"; },
    (value) => { value.period = "Другой период"; },
    (value) => { value.supervisorId = "another-supervisor"; },
    (value) => { value.roster[0].studentId = "another-student"; },
    (value) => { value.attempts[0].teacherId = "another-teacher"; },
    (value) => { value.attempts[0].startsAt = "15:00"; },
    (value) => { value.attempts[0].room = "Другой кабинет"; },
    (value) => { value.attempts[0].memberIds = ["another-member"]; },
    (value) => { value.attempts[0].results[0].outcome = { status: "absent" }; },
    (value) => { value.attempts[0].state = "draft"; },
  ])("keeps a changed source blocked instead of silently adopting its revision (%#)", (change) => {
    const original = source(); const next = structuredClone(original); change(next);
    const before = JSON.stringify(next);
    expect(() => requireUnchangedAttemptSource(original, next)).toThrow("Ввод сохранён");
    expect(JSON.stringify(next)).toBe(before);
  });
  it("rejects a missing original or inaccessible latest source", () => {
    expect(() => requireUnchangedAttemptSource(undefined, source())).toThrow("недоступна");
    expect(() => requireUnchangedAttemptSource(source(), undefined)).toThrow("недоступна");
  });
  it("compares semantic fields rather than JSON object property order", () => {
    const original = source();
    const next = JSON.parse(JSON.stringify(original, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value)) as Assessment;
    expect(() => requireUnchangedAttemptSource(original, next)).not.toThrow();
  });
});
