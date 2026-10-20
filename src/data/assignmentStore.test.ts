import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAssignments, getSubmissions, removeAssignmentRecords, saveAssignments, saveSubmissions, type Submission } from "./assignmentStore";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  removeItem: (key: string) => { values.delete(key); },
};
const dispatch = vi.fn();
const answer: Submission = { id: "answer-1", assignmentId: "linear-algebra-rgr-2", studentId: "anna-smirnova", studentName: "Анна Смирнова", text: "Финальный ответ", grade: "5", teacherComment: "Хорошо", status: "graded", sentAt: "2026-09-12T12:00", updatedAt: "2026-09-13T12:00", attachmentId: "latest-file", attachmentName: "latest.pdf" };

beforeEach(() => {
  values.clear();
  storage.setItem.mockClear();
  dispatch.mockClear();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { dispatchEvent: dispatch });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("assignment persistence", () => {
  it("migrates legacy answers without losing their feedback", () => {
    saveSubmissions([answer]);
    const saved = getSubmissions()[0];
    expect(saved.attempts).toHaveLength(1);
    expect(saved.attempts?.[0]).toMatchObject({ text: answer.text, grade: "5", teacherComment: "Хорошо", attachmentId: "latest-file", status: "graded" });
  });

  it("does not copy the latest grade, file, or comment into earlier attempts", () => {
    saveSubmissions([{ ...answer, attempts: [
      { id: "first", number: 1, text: "Первый ответ", status: "revision", teacherComment: "Исправить", sentAt: answer.sentAt, updatedAt: answer.sentAt, submittedLate: false },
      { id: "second", number: 2, text: answer.text, grade: "5", status: "graded", teacherComment: "Хорошо", attachmentId: "latest-file", attachmentName: "latest.pdf", sentAt: answer.updatedAt, updatedAt: answer.updatedAt, submittedLate: false },
    ] }]);
    const saved = getSubmissions()[0];
    expect(saved.attempts?.[0].grade).toBeUndefined();
    expect(saved.attempts?.[0].attachmentId).toBeUndefined();
    expect(saved.attempts?.[0].teacherComment).toBe("Исправить");
    expect(saved.grade).toBe("5");
    saveSubmissions([saved]);
    expect(getSubmissions()[0]).toEqual(saved);
  });

  it("preserves an empty answer and absent feedback in a structured attempt", () => {
    saveSubmissions([{ ...answer, attempts: [{ id: "first", number: 1, text: "", status: "submitted", sentAt: answer.sentAt, updatedAt: answer.sentAt, submittedLate: false }] }]);
    expect(getSubmissions()[0]).toMatchObject({ text: "", status: "submitted", grade: undefined, teacherComment: undefined, attachmentId: undefined });
  });

  it("deletes only a selected assignment and its answers", () => {
    const assignments = getAssignments();
    saveAssignments(assignments);
    saveSubmissions([answer, { ...answer, id: "other", assignmentId: assignments[1].id }]);
    const removed = removeAssignmentRecords(assignments[0].id);
    expect(removed.submissions).toHaveLength(1);
    expect(getAssignments()).toEqual([assignments[1]]);
    expect(getSubmissions().map((item) => item.id)).toEqual(["other"]);
  });

  it("restores both records when saving the linked deletion fails", () => {
    saveAssignments(getAssignments());
    saveSubmissions([answer]);
    const before = new Map(values);
    const write = storage.setItem.getMockImplementation()!;
    storage.setItem.mockImplementationOnce(write).mockImplementationOnce(() => { throw new Error("quota"); });
    expect(() => removeAssignmentRecords(answer.assignmentId)).toThrow("quota");
    expect(values).toEqual(before);
  });

  it("restores the absence of a key for untouched demo records", () => {
    const write = storage.setItem.getMockImplementation()!;
    storage.setItem.mockImplementationOnce(write).mockImplementationOnce(() => { throw new Error("quota"); });
    expect(() => removeAssignmentRecords(answer.assignmentId)).toThrow("quota");
    expect(values.size).toBe(0);
    expect(getAssignments()).toHaveLength(2);
  });
});
