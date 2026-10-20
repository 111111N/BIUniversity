import { afterEach, describe, expect, it, vi } from "vitest";
import { readAssignmentData, readAssignmentState } from "./assignmentData";

const answer = { id: "answer", assignmentId: "task", studentId: "student", studentName: "Student", sentAt: "2026-10-20T10:00", updatedAt: "2026-10-20T10:00", text: "Original answer", status: "submitted" };
const attempt = { id: "attempt", number: 1, sentAt: answer.sentAt, updatedAt: answer.updatedAt, text: "Attempt text", status: "submitted", submittedLate: false };
const storedSubmission = (value: unknown) => {
  const raw = JSON.stringify([value]);
  const storage = { getItem: (key: string) => key.endsWith("submissions") ? raw : "[]", setItem: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal("localStorage", storage);
  return storage;
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("assignment screen read failures", () => {
  it.each(["not-json", "{}", "[null]", '[{"id":"broken"}]'])("does not display demo assignments for damaged stored data: %s", (raw) => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => key.endsWith("assignments") ? raw : null });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const state = readAssignmentState();
    expect(state.error).toContain("Сохранение приостановлено");
    expect(state.assignments).toEqual([]);
  });
  it("preserves normal empty storage without marking it as a failure", () => {
    vi.stubGlobal("localStorage", { getItem: () => "[]" });
    expect(readAssignmentState()).toEqual({ assignments: [], submissions: [], error: "" });
  });

  it.each([
    null, "broken", {}, [null], [{}], [{ ...attempt, text: { damaged: true } }],
    [{ ...attempt, id: "" }], [{ ...attempt, number: 0 }], [{ ...attempt, number: 1.5 }],
    [{ ...attempt, number: "1" }], [{ ...attempt, status: "unknown" }],
    [{ ...attempt, submittedLate: "false" }], [{ ...attempt, sentAt: "invalid" }],
    [{ ...attempt, updatedAt: "invalid" }], [{ ...attempt, reviewedAt: "invalid" }],
    [{ ...attempt, reviewedAt: null }], [{ ...attempt, grade: 5 }],
    [{ ...attempt, teacherComment: [] }], [{ ...attempt, attachmentName: { damaged: true } }],
    [{ ...attempt, attachmentId: 123 }], [attempt, { ...attempt, number: 2 }],
  ].map((attempts) => ({ attempts })))("blocks damaged attempt history before it can replace the original answer: $attempts", ({ attempts }) => {
    const storage = storedSubmission({ ...answer, attempts });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => readAssignmentData()).toThrow("Сохранённые задания или ответы повреждены");
    const state = readAssignmentState();
    expect(state.error).toContain("Сохранение приостановлено");
    expect(state.submissions).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.getItem("bi-university-demo-submissions")).toContain("Original answer");
  });

  it.each(["id", "number", "sentAt", "updatedAt", "text", "status", "submittedLate"])("rejects a partial structured attempt missing %s", (field) => {
    const partial: Record<string, unknown> = { ...attempt };
    delete partial[field];
    storedSubmission({ ...answer, attempts: [partial] });
    expect(() => readAssignmentData()).toThrow("Сохранённые задания или ответы повреждены");
  });

  it.each([{ attempts: undefined }, { attempts: [] }])("preserves legacy top-level text and feedback without a populated history: $attempts", ({ attempts }) => {
    storedSubmission({ ...answer, status: "graded", grade: "5", teacherComment: "Feedback", attachmentId: "file", attachmentName: "answer.pdf", attempts });
    const state = readAssignmentState();
    expect(state.error).toBe("");
    expect(state.submissions[0]).toMatchObject({ text: "Original answer", status: "graded", grade: "5", teacherComment: "Feedback", attachmentId: "file" });
    expect(state.submissions[0].attempts).toHaveLength(1);
  });

  it("preserves structured histories and supports older reviews without reviewedAt", () => {
    storedSubmission({ ...answer, attempts: [
      { ...attempt, status: "revision", teacherComment: "First feedback" },
      { ...attempt, id: "second", number: 2, text: "", status: "graded", grade: "4", teacherComment: "Final feedback", reviewedAt: "2026-10-21T10:00", attachmentId: "file", attachmentName: "answer.pdf" },
    ] });
    const state = readAssignmentState();
    expect(state.error).toBe("");
    expect(state.submissions[0].attempts).toHaveLength(2);
    expect(state.submissions[0].attempts?.[0]).toMatchObject({ text: "Attempt text", status: "revision", teacherComment: "First feedback" });
    expect(state.submissions[0]).toMatchObject({ text: "", status: "graded", grade: "4", teacherComment: "Final feedback", attachmentName: "answer.pdf" });
  });

  it("blocks malformed legacy text instead of passing an object to the answer view", () => {
    storedSubmission({ ...answer, text: { damaged: true } });
    expect(() => readAssignmentData()).toThrow("Сохранённые задания или ответы повреждены");
  });
});
