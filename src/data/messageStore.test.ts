import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { messageRepository, type MessagingState } from "./messageStore";

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
});

afterEach(() => { Reflect.deleteProperty(globalThis, "localStorage"); });

describe("message repository", () => {
  it("stores teacher and student conversations separately", () => {
    const state: MessagingState = { dialogIds: ["teacher-1"], messages: { "teacher-1": [{ id: 1, incoming: false, text: "Ответ", time: "12:00" }] }, unread: { students: 0, teachers: 1, groups: 0 } };
    expect(messageRepository.save("student", state)).toBe(true);
    expect(messageRepository.read("student")).toEqual(state);
    expect(messageRepository.read("teacher")).toBeNull();
  });

  it("returns a safe fallback for corrupted data", () => {
    values.set("bi-university-messages-v1:student", "not-json");
    expect(messageRepository.read("student")).toBeNull();
  });
});
