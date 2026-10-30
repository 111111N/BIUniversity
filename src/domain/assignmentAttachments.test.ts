import { describe, expect, it } from "vitest";
import { getAssignmentAttachmentName } from "./assignmentAttachments";

describe("assignment attachment presentation", () => {
  it.each([undefined, {}, { attachmentName: "missing.pdf" }, { attachmentId: "", attachmentName: "missing.pdf" }])("does not claim a retained file without an identifier: %j", (attachment) => {
    expect(getAssignmentAttachmentName(attachment)).toBeUndefined();
    expect(getAssignmentAttachmentName(attachment, "answer")).toBeUndefined();
  });

  it.each([undefined, "", " \t\n "])("provides useful names for a stored file with an empty name: %j", (attachmentName) => {
    const attachment = { attachmentId: "stored-file", attachmentName };
    expect(getAssignmentAttachmentName(attachment)).toBe("Файл задания");
    expect(getAssignmentAttachmentName(attachment, "answer")).toBe("Вложение к ответу");
    expect(attachment).toEqual({ attachmentId: "stored-file", attachmentName });
  });

  it("keeps the original filename intact, including spaces and its extension", () => {
    const attachment = { attachmentId: "stored-file", attachmentName: "  Моё решение.pdf " };
    expect(getAssignmentAttachmentName(attachment)).toBe(attachment.attachmentName);
    expect(getAssignmentAttachmentName(attachment, "answer")).toBe(attachment.attachmentName);
  });
});
