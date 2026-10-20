import { describe, expect, it } from "vitest";
import { formatFileSize, getAttachmentError, MAX_ATTACHMENT_SIZE } from "./files";

describe("attachment rules", () => {
  it("accepts the limit and rejects only larger files", () => {
    expect(getAttachmentError({ size: MAX_ATTACHMENT_SIZE })).toBe("");
    expect(getAttachmentError({ size: MAX_ATTACHMENT_SIZE + 1 })).toContain("25 МБ");
  });
  it("formats sizes consistently across assignments and materials", () => {
    expect(formatFileSize(0)).toBe("0 Б");
    expect(formatFileSize(1024)).toBe("1.0 КБ");
    expect(formatFileSize(MAX_ATTACHMENT_SIZE)).toBe("25.0 МБ");
  });
});
