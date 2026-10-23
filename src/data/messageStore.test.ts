import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyMessagingState, messageRepository, type MessagingState, type StoredMessage } from "./messageStore";

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
});

afterEach(() => { Reflect.deleteProperty(globalThis, "localStorage"); Reflect.deleteProperty(globalThis, "window"); vi.restoreAllMocks(); });

const student = { role: "student" as const, id: "anna-smirnova" };
const teacher = { role: "teacher" as const, id: "teacher-elena-volkova" };
const letter = (id = 100, text = "Сообщение студента"): StoredMessage => ({ id, text, incoming: false, time: "12:00", sentAt: "2026-10-22T12:00:00", deliveryId: `delivery-${id}` });
const mailbox = (contactId: string, messages: StoredMessage[]): MessagingState => ({ ...createEmptyMessagingState(), dialogIds: [contactId], messages: { [contactId]: messages } });

describe("message repository", () => {
  it("never falls back from a new identity or configurator to a demo mailbox", () => {
    messageRepository.save("teacher", mailbox("anna-smirnova", [letter()]));
    expect(messageRepository.readState("teacher", "new-teacher")).toEqual({ state: null, error: "" });
    expect(messageRepository.readState("configurator", "configurator-demo")).toEqual({ state: null, error: "" });
    expect(messageRepository.readState("configurator").error).not.toBe("");
  });
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

  it("delivers both directions with opposite incoming flags and preserved replies", () => {
    expect(messageRepository.deliverDirect(student, teacher, letter(), []).error).toBe("");
    const received = messageRepository.read("teacher")!;
    expect(received.messages[student.id][0]).toMatchObject({ text: "Сообщение студента", incoming: true, deliveryId: "delivery-100" });
    expect(received.unread.students).toBe(1);
    expect(messageRepository.read("student")!.messages[teacher.id][0].incoming).toBe(false);
    expect(messageRepository.deliverDirect(teacher, student, { ...letter(101, "Ответ преподавателя"), replyTo: 100 }, []).error).toBe("");
    expect(messageRepository.read("student")!.messages[teacher.id][1]).toMatchObject({ incoming: true, replyTo: 100, text: "Ответ преподавателя" });
    expect(messageRepository.read("student", "another-student")).toBeNull();
  });

  it("preserves other dialogs and old storage keys while migrating a mailbox", () => {
    const old = JSON.stringify(mailbox("someone-else", [{ id: 1, incoming: false, text: "Старая история", time: "10:00" }]));
    values.set("bi-university-messages-v2:teacher:teacher-elena-volkova", old);
    messageRepository.deliverDirect(student, teacher, letter(), []);
    expect(messageRepository.read("teacher")!.messages["someone-else"][0].text).toBe("Старая история");
    expect(values.get("bi-university-messages-v2:teacher:teacher-elena-volkova")).toBe(old);
  });

  it("does not duplicate a retried delivery or increase unread twice", () => {
    messageRepository.deliverDirect(student, teacher, letter(), []);
    messageRepository.deliverDirect(student, teacher, letter(), []);
    expect(messageRepository.read("teacher")!.messages[student.id]).toHaveLength(1);
    expect(messageRepository.read("teacher")!.unread.students).toBe(1);
  });

  it("keeps a recipient's copy after local deletion by the sender", () => {
    messageRepository.deliverDirect(student, teacher, letter(), []);
    const own = messageRepository.read("student")!;
    expect(messageRepository.save("student", { ...own, messages: { [teacher.id]: [] } })).toBe(true);
    expect(messageRepository.read("teacher")!.messages[student.id]).toHaveLength(1);
  });

  it("commits neither mailbox if storage rejects the combined write", () => {
    messageRepository.save("student", mailbox(teacher.id, []));
    const before = values.get("bi-university-messages-v3");
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(messageRepository.deliverDirect(student, teacher, letter(), []).error).not.toBe("");
    expect(values.get("bi-university-messages-v3")).toBe(before);
    expect(messageRepository.read("teacher")).toBeNull();
  });

  it("does not overwrite a corrupt recipient mailbox", () => {
    values.set("bi-university-messages-v2:teacher:teacher-elena-volkova", "broken");
    expect(messageRepository.deliverDirect(student, teacher, letter(), []).error).not.toBe("");
    expect(values.has("bi-university-messages-v3")).toBe(false);
    expect(values.get("bi-university-messages-v2:teacher:teacher-elena-volkova")).toBe("broken");
  });

  it("assigns the same non-conflicting ID to both copies", () => {
    messageRepository.save("teacher", mailbox(student.id, [{ id: 100, incoming: false, text: "Другая запись", time: "10:00" }]));
    messageRepository.deliverDirect(student, teacher, letter(), []);
    const own = messageRepository.read("student")!.messages[teacher.id][0];
    const received = messageRepository.read("teacher")!.messages[student.id][1];
    expect(own.id).toBe(101);
    expect(received.id).toBe(own.id);
  });

  it("recovers an old outgoing message without appending a second sender copy", () => {
    const old = { ...letter(), deliveryId: undefined };
    values.set("bi-university-messages-v2:student:anna-smirnova", JSON.stringify(mailbox(teacher.id, [old])));
    messageRepository.deliverDirect(student, teacher, { ...old, deliveryId: "legacy-100" }, [], undefined, true);
    expect(messageRepository.read("student")!.messages[teacher.id]).toHaveLength(1);
    expect(messageRepository.read("teacher")!.messages[student.id][0]).toMatchObject({ text: old.text, incoming: true });
  });

  it("notifies a recipient in the same document and unsubscribes cleanly", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
    const listener = vi.fn();
    const unsubscribe = messageRepository.subscribe("teacher", teacher.id, listener);
    messageRepository.deliverDirect(student, teacher, letter(), []);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    messageRepository.deliverDirect(student, teacher, letter(101), []);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
