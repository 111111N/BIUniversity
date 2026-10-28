import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readNotificationState } from "./notificationStore";

let stored: string;
const setItem = vi.fn();
beforeEach(() => { setItem.mockClear(); vi.stubGlobal("window", { localStorage: { getItem: () => stored, setItem } }); });
afterEach(() => vi.unstubAllGlobals());
const read = (href: string) => {
  stored = JSON.stringify({ version: 2, items: [{ id: "notice", recipientUserId: "anna-smirnova", kind: "schedule", title: "Расписание изменилось", body: "Проверьте занятия", href, createdAt: "2026-10-28T10:00:00Z", read: false }] });
  const result = readNotificationState(); expect(result.error).toBe(""); expect(result.items).toHaveLength(1);
  return result.items[0].href;
};
describe("stored notification links", () => {
  it("rejects the same complete ASCII control range without a control-character regular expression", () => {
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
      expect(read(`/schedule?query=before${String.fromCharCode(code)}after`)).toBe("/notifications");
    }
  });
  it.each(["https://example.test", "//example.test/schedule", "/schedule\\other", "schedule", "javascript:alert(1)"])("retains the local-link restriction for %s", (href) => {
    expect(read(href)).toBe("/notifications");
  });
  it.each(["/schedule?date=2026-10-28", "/students/иван?name=Ёлкин", "/messages?contact=😀", `/schedule?query=before${String.fromCharCode(32)}after`, `/schedule?query=before${String.fromCharCode(128)}after`])("preserves a valid path, Unicode and permitted boundary characters: %s", (href) => {
    expect(read(`  ${href}  `)).toBe(href);
  });
  it("does not rewrite stored bytes while normalizing a displayed link", () => {
    expect(read("//example.test")).toBe("/notifications");
    const original = stored; expect(readNotificationState().items[0].href).toBe("/notifications");
    expect(stored).toBe(original); expect(setItem).not.toHaveBeenCalled();
  });
});
