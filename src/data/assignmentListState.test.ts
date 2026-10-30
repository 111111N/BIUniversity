import { afterEach, describe, expect, it, vi } from "vitest";
import type { Assignment } from "./assignmentStore";
import { readAssignmentListState } from "./assignmentData";

const assignment: Assignment = {
  id: "saved-task", subjectId: "saved-subject", groupId: "saved-group", subject: "Дисциплина", group: "Группа",
  title: "Сохранённое задание", description: "Условие", lessonDate: "2026-10-30T09:00", lessonType: "Практика",
  deadline: "2026-11-01T23:59", status: "published", allowLateSubmissions: false, createdAt: "2026-10-29T12:00", updatedAt: "2026-10-29T12:00",
};
const storage = (raw: string | null) => {
  const value = { raw };
  const methods = { getItem: vi.fn((key: string) => {
    if (key !== "bi-university-demo-assignments") throw new Error("Read-only assignment list must not read answers or other stores");
    return value.raw;
  }), setItem: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal("localStorage", methods);
  return { value, methods };
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("read-only assignment list", () => {
  it("reads only saved assignments once, independently of missing or damaged student answers", () => {
    const saved = storage(JSON.stringify([assignment]));
    expect(readAssignmentListState()).toEqual({ assignments: [assignment], error: "" });
    expect(saved.methods.getItem).toHaveBeenCalledExactlyOnceWith("bi-university-demo-assignments");
    expect(saved.methods.setItem).not.toHaveBeenCalled(); expect(saved.methods.removeItem).not.toHaveBeenCalled();
  });

  it.each(["PRIVATE invalid JSON", "{}", "[null]", '[{"id":"PRIVATE"}]'])("does not turn damaged assignments into demo data or a confirmed empty list: %s", (raw) => {
    const saved = storage(raw); const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = readAssignmentListState();
    expect(result.assignments).toEqual([]); expect(result.error).toBe("Не удалось прочитать список заданий.");
    expect(result.error).not.toContain("PRIVATE"); expect(log).toHaveBeenCalledOnce();
    expect(saved.value.raw).toBe(raw); expect(saved.methods.setItem).not.toHaveBeenCalled(); expect(saved.methods.removeItem).not.toHaveBeenCalled();
  });

  it("keeps a readable empty list distinct from an error", () => {
    storage("[]"); expect(readAssignmentListState()).toEqual({ assignments: [], error: "" });
  });

  it("preserves the existing demo initialization only when no assignment document is saved", () => {
    storage(null); const result = readAssignmentListState();
    expect(result.error).toBe(""); expect(result.assignments.length).toBeGreaterThan(0);
  });

  it("recovers from a failed read without changing the source or caching a false empty result", () => {
    const saved = storage("broken"); vi.spyOn(console, "error").mockImplementation(() => {});
    expect(readAssignmentListState().error).not.toBe("");
    saved.value.raw = JSON.stringify([assignment]);
    expect(readAssignmentListState()).toEqual({ assignments: [assignment], error: "" });
    expect(saved.methods.setItem).not.toHaveBeenCalled();
  });

  it("handles denied storage access without falling back to demo records", () => {
    const saved = storage("[]"); const error = new Error("Storage denied");
    saved.methods.getItem.mockImplementation(() => { throw error; });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(readAssignmentListState()).toEqual({ assignments: [], error: "Не удалось прочитать список заданий." });
    expect(log).toHaveBeenCalledWith("Не удалось прочитать список заданий:", error);
  });
});
