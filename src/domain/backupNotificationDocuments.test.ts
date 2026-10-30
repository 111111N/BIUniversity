import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectBackupNotifications } from "./backupNotificationDocuments";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { notificationBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Archive checks must not read live data or write notifications"); });
const accounts = new Set(["student-1", "teacher-1"]);
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("archived notifications", () => {
  it("checks the current document and archived recipient without exposing text or opening links", async () => {
    const state = notificationBackupFixture(); const before = JSON.stringify(state.archive);
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts).toEqual({ valid: 10, invalid: 0, absent: 3, unchecked: 0, errors: 0, reviews: 0 });
    expect(review.checks).toContainEqual(expect.objectContaining({ kind: "notifications", status: "valid", records: 1, documents: 1 }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review)).not.toContain("/schedule?date");
    expect(JSON.stringify(state.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });

  it.each(["array", "v1", "unversioned"])("accepts a legacy %s with an explicit userId without migration", async (format) => {
    const state = notificationBackupFixture(); const { recipientUserId: userId, ...notice } = state.notifications[0];
    const items = [{ ...notice, userId }]; const data = format === "array" ? items : format === "v1" ? { version: 1, items } : { items };
    const entry = { key: state.notificationKey, raw: JSON.stringify(data) }; const before = entry.raw;
    expect((await inspectBackupNotifications([entry], accounts)).issues).toEqual([]); expect(entry.raw).toBe(before);
  });

  it("does not infer a legacy role's owner, create IDs or fill missing links", async () => {
    const state = notificationBackupFixture();
    const entry = { key: state.notificationKey, raw: JSON.stringify([{ kind: "schedule", title: "PRIVATE LEGACY", recipientRole: "student", createdAt: "2026-10-29T10:00Z" }]) };
    const before = entry.raw; const review = await inspectBackupNotifications([entry], accounts);
    expect(review.checks[0].status).toBe("valid");
    for (const code of ["legacy-notification-id-row-1", "legacy-notification-recipient-row-1", "legacy-notification-link-row-1"]) expect(review.issues).toContainEqual(expect.objectContaining({ level: "review", code }));
    expect(entry.raw).toBe(before); expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(forbidden).not.toHaveBeenCalled();
  });

  it.each([
    { id: "" }, { recipientUserId: "" }, { title: "" }, { kind: "unknown" }, { createdAt: "invalid" },
    { body: 123 }, { read: "false" }, { href: [] }, { dedupeKey: {} },
  ])("rejects malformed current fields without normalizing them: %j", async (change) => {
    const state = notificationBackupFixture(); Object.assign(state.notifications[0], change); state.save();
    const review = await inspectBackupNotifications(state.archive.localStorage, accounts);
    expect(review.checks[0].status).toBe("invalid"); expect(review.checks[0]).not.toHaveProperty("records");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "invalid-notification-document", level: "error" }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it.each(["{PRIVATE BROKEN", "{}", "[null]", '{"version":99,"items":[]}'])("reports malformed or unsupported payloads: %s", async (raw) => {
    const review = await inspectBackupNotifications([{ key: "bi-university-demo-notifications", raw }], accounts);
    expect(review.checks[0].status).toBe("invalid"); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("does not discard bad rows from an otherwise readable list", async () => {
    const state = notificationBackupFixture(); const entry = { key: state.notificationKey, raw: JSON.stringify({ version: 2, items: [state.notifications[0], null] }) };
    const before = entry.raw; const review = await inspectBackupNotifications([entry], accounts);
    expect(review.checks[0].status).toBe("invalid"); expect(review.checks[0]).not.toHaveProperty("records"); expect(entry.raw).toBe(before);
  });

  it("rejects duplicate IDs even when whitespace would hide the collision", async () => {
    const state = notificationBackupFixture(); state.notifications.push({ ...state.notifications[0], id: " notice-1 " }); state.save();
    expect((await inspectBackupNotifications(state.archive.localStorage, accounts)).checks[0].status).toBe("invalid");
  });

  it("keeps deduplication keys scoped to recipients and rejects collisions within one recipient", async () => {
    const state = notificationBackupFixture(); state.notifications[0].dedupeKey = "PRIVATE KEY";
    state.notifications.push({ ...state.notifications[0], id: "notice-2", recipientUserId: "teacher-1" }); state.save();
    expect((await inspectBackupNotifications(state.archive.localStorage, accounts)).issues).toEqual([]);
    state.notifications[1].recipientUserId = "student-1"; state.save();
    const review = await inspectBackupNotifications(state.archive.localStorage, accounts);
    expect(review.checks[0].status).toBe("invalid"); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("distinguishes unknown account data from a proven missing recipient", async () => {
    const state = notificationBackupFixture();
    expect((await inspectBackupNotifications(state.archive.localStorage)).issues).toContainEqual(expect.objectContaining({ code: "unchecked-notification-recipient", level: "review", recordId: "notice-1" }));
    expect((await inspectBackupNotifications(state.archive.localStorage, new Set())).issues).toContainEqual(expect.objectContaining({ code: "missing-notification-recipient", level: "error" }));
  });

  it("reports conflicting recipient fields without choosing an account", async () => {
    const state = notificationBackupFixture(); Object.assign(state.notifications[0], { userId: "teacher-1" }); state.save();
    const review = await inspectBackupNotifications(state.archive.localStorage, accounts);
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "notification-recipient-conflict", recordId: "notice-1" }));
  });
  it("does not use a legacy fallback when an explicitly saved recipient is blank", async () => {
    const state = notificationBackupFixture();
    const entry = { key: state.notificationKey, raw: JSON.stringify([{ ...state.notifications[0], recipientUserId: "", userId: "student-1", recipientRole: "student" }]) };
    expect((await inspectBackupNotifications([entry], accounts)).checks[0].status).toBe("invalid");
  });

  it.each(["https://PRIVATE.example", "//PRIVATE.example", "javascript:PRIVATE()", "/schedule\\PRIVATE", "/schedule?PRIVATE=before\u0000after"])("reports an unacceptable link without copying its value: %s", async (href) => {
    const state = notificationBackupFixture(); state.notifications[0].href = href; state.save();
    const review = await inspectBackupNotifications(state.archive.localStorage, accounts);
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "invalid-notification-link", level: "error", recordId: "notice-1" }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(state.notifications[0].href).toBe(href);
  });

  it("preserves valid local Unicode links and checks all control characters after trimming", async () => {
    const state = notificationBackupFixture(); state.notifications[0].href = "  /students/иван?name=Ёлкин  "; state.save();
    expect((await inspectBackupNotifications(state.archive.localStorage, accounts)).issues).toEqual([]);
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
      state.notifications[0].href = `/schedule?x=a${String.fromCharCode(code)}b`; state.save();
      expect((await inspectBackupNotifications(state.archive.localStorage, accounts)).issues).toContainEqual(expect.objectContaining({ code: "invalid-notification-link" }));
    }
  });

  it("preserves separate findings for multiple notices in one list", async () => {
    const state = notificationBackupFixture(); state.notifications[0].href = "//PRIVATE"; state.notifications.push({ ...state.notifications[0], id: "notice-2" }); state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.issues.filter((issue) => issue.code === "invalid-notification-link").map((issue) => issue.recordId)).toEqual(["notice-1", "notice-2"]);
    expect(review.counts.errors).toBe(2);
  });

  it("distinguishes absent notifications from a saved empty list and flags future keys", async () => {
    expect((await inspectBackupNotifications([])).checks[0].status).toBe("absent");
    const key = "bi-university-demo-notifications";
    expect((await inspectBackupNotifications([{ key, raw: '{"version":2,"items":[]}' }], accounts)).checks[0]).toMatchObject({ status: "valid", records: 0 });
    expect((await inspectBackupNotifications([{ key: `${key}-v3`, raw: "[]" }], accounts)).issues).toContainEqual(expect.objectContaining({ code: "unsupported-notification-key" }));
  });

  it("cancels while checking a large list without returning a partial report", async () => {
    const state = notificationBackupFixture(); const items = Array.from({ length: 260 }, (_, index) => ({ ...state.notifications[0], id: `notice-${index}` }));
    const controller = new AbortController();
    const promise = inspectBackupNotifications([{ key: state.notificationKey, raw: JSON.stringify({ version: 2, items }) }], accounts, controller.signal); controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
