import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverDirectMessage, recoverDemoDirectMessages } from "./messageDelivery";
import { messageRepository, createEmptyMessagingState, type StoredMessage } from "./messageStore";
import { messageAttachmentRepository } from "./messageAttachmentRepository";

vi.mock("./messageAttachmentRepository", () => ({ messageAttachmentRepository: { copy: vi.fn(async () => []), remove: vi.fn(async () => {}) } }));
const student = { role: "student" as const, id: "anna-smirnova" };
const teacher = { role: "teacher" as const, id: "teacher-elena-volkova" };
const values = new Map<string, string>();
const message: StoredMessage = { id: 100, text: "Передача вложения", incoming: false, time: "12:00", sentAt: "2026-10-22T12:00:00", attachments: [{ id: "source-file", name: "file.txt", type: "text/plain", size: 4 }] };

beforeEach(() => {
  values.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(messageAttachmentRepository.copy).mockReset().mockResolvedValue([]);
  vi.mocked(messageAttachmentRepository.remove).mockReset().mockResolvedValue(undefined);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } });
});
afterEach(() => { Reflect.deleteProperty(globalThis, "localStorage"); vi.restoreAllMocks(); });

describe("direct message delivery", () => {
  it("stores an independent attachment copy in the recipient scope", async () => {
    vi.mocked(messageAttachmentRepository.copy).mockResolvedValue([{ ...message.attachments![0], id: "recipient-file" }]);
    await deliverDirectMessage(student, teacher, message);
    expect(messageAttachmentRepository.copy).toHaveBeenCalledWith("student:anna-smirnova:teacher-elena-volkova", "teacher:teacher-elena-volkova:anna-smirnova", ["source-file"]);
    expect(messageRepository.read("teacher")!.messages[student.id][0].attachments![0].id).toBe("recipient-file");
    expect(messageRepository.read("student")!.messages[teacher.id][0].attachments![0].id).toBe("source-file");
  });

  it("cleans up temporary recipient files when delivery fails", async () => {
    vi.mocked(messageAttachmentRepository.copy).mockResolvedValue([{ ...message.attachments![0], id: "recipient-file" }]);
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await expect(deliverDirectMessage(student, teacher, message)).rejects.toThrow();
    expect(messageAttachmentRepository.remove).toHaveBeenCalledWith("teacher:teacher-elena-volkova:anna-smirnova", ["recipient-file"]);
    expect(messageRepository.read("teacher")).toBeNull();
  });

  it("recovers timed outgoing history once and leaves example messages alone", async () => {
    const old = { ...message, attachments: undefined };
    const state = { ...createEmptyMessagingState(), dialogIds: [teacher.id], messages: { [teacher.id]: [{ id: 1, text: "Пример", incoming: false, time: "10:00" }, old] } };
    values.set("bi-university-messages-v2:student:anna-smirnova", JSON.stringify(state));
    await recoverDemoDirectMessages([student, teacher]);
    await recoverDemoDirectMessages([student, teacher]);
    expect(messageRepository.read("teacher")!.messages[student.id]).toHaveLength(1);
    expect(messageRepository.read("student")!.messages[teacher.id]).toHaveLength(2);
    expect(messageRepository.read("teacher")!.messages[student.id][0].text).toBe(message.text);
  });
});
