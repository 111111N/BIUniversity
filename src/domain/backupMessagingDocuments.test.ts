import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectBackupMessaging } from "./backupMessagingDocuments";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { messagingBackupFixture } from "../testSupport/localBackupDocuments";

const database = "bi-university-messages-v3";
const mailbox = "bi-university-messages-v2:student:student-1";
const owners = new Set(["student-1", "teacher-1"]);
const state = () => ({ dialogIds: ["teacher-1"], messages: { "teacher-1": [{ id: 1, incoming: false, text: "PRIVATE MESSAGE", time: "вчера" }] }, unread: { students: 0, teachers: 0, groups: 0 } });
const entry = (value: unknown, key = mailbox) => ({ key, raw: JSON.stringify(value) });
const forbidden = vi.fn(() => { throw new Error("Archive inspection must not use live stores or deliver messages"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); vi.stubGlobal("window", { dispatchEvent: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("archived messaging documents", () => {
  it("checks the full archive without reading live state, changing sources or revealing message text", async () => {
    const fixture = messagingBackupFixture(); const before = JSON.stringify(fixture.archive);
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.counts).toEqual({ valid: 12, invalid: 0, absent: 1, unchecked: 0, errors: 0, reviews: 0 });
    expect(review.checks).toContainEqual(expect.objectContaining({ kind: "messaging", documents: 1, records: 2, status: "valid" }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });

  it("reads v1, v2 and v3 independently, without merging legacy copies or guessing a role-only owner", async () => {
    const entries = [entry(state(), "bi-university-messages-v1:student"), entry(state()), entry({ version: 1, users: { [mailbox]: state() } }, database)];
    const before = JSON.stringify(entries); const review = await inspectBackupMessaging(entries, owners);
    expect(review.checks[0]).toMatchObject({ status: "valid", documents: 3, records: 3 });
    expect(review.issues).toEqual([expect.objectContaining({ code: "legacy-message-owner", level: "review" })]);
    expect(JSON.stringify(review)).not.toContain("anna-smirnova"); expect(JSON.stringify(entries)).toBe(before);
  });

  it("preserves optional legacy fields, arbitrary finite numeric IDs and display-only time", async () => {
    const value = { dialogIds: ["teacher-1"], messages: { "teacher-1": [{ id: -0.5, incoming: true, text: "PRIVATE", time: "давно" }] } };
    const review = await inspectBackupMessaging([entry(value)], owners);
    expect(review.checks[0]).toMatchObject({ status: "valid", records: 1 }); expect(review.issues).toEqual([]);
  });

  it("supports attachment-only messages without reading files or exposing names", async () => {
    const value = state(); Object.assign(value.messages["teacher-1"][0], { text: "", attachments: [{ id: "file-1", name: "PRIVATE FILE", type: "PRIVATE TYPE", size: 0 }], sentAt: "2026-10-29T12:00:00Z" });
    const review = await inspectBackupMessaging([entry(value)], owners);
    expect(review.checks[0].status).toBe("valid"); expect(review.issues).toEqual([]); expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(forbidden).not.toHaveBeenCalled();
  });

  it.each([
    { text: " " }, { incoming: "yes" }, { id: "1" }, { time: 12 }, { replyTo: "1" }, { sentAt: "PRIVATE DATE" }, { deliveryId: "" },
    { attachments: [{ id: "file", name: "PRIVATE", type: "text/plain", size: -1 }] }, { attachments: Array.from({ length: 6 }, () => ({ id: "file", name: "PRIVATE", type: "", size: 1 })) },
  ])("reports invalid message fields without discarding records: %j", async (patch) => {
    const value = state(); Object.assign(value.messages["teacher-1"][0], patch);
    const source = entry(value); const before = source.raw;
    const review = await inspectBackupMessaging([source], owners);
    expect(review.checks[0].status).toBe("invalid"); expect(review.checks[0].records).toBeUndefined();
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "invalid-message-state", referenceId: mailbox, recordId: mailbox }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(source.raw).toBe(before);
  });

  it.each([{ dialogIds: [""] }, { messages: [] }, { unread: { teachers: -1 } }, { unread: { teachers: 0.5 } }, { groups: [{ id: "g", name: "PRIVATE", memberIds: [""], createdAt: 0 }] }, { leftGroupIds: [3] }])("rejects malformed mailbox containers: %j", async (patch) => {
    const review = await inspectBackupMessaging([entry({ ...state(), ...patch })], owners);
    expect(review.checks[0].status).toBe("invalid"); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("continues with other mailboxes and documents after one fails, without publishing a partial message count", async () => {
    const fixture = messagingBackupFixture(); fixture.messaging.users[mailbox].messages["teacher-1"].push({ id: 1, incoming: false, text: "PRIVATE DUPLICATE", time: "12:01", deliveryId: "delivery-2" });
    fixture.messaging.users["bi-university-messages-v2:teacher:teacher-1"].dialogIds.push("unknown-contact"); fixture.save();
    const review = await inspectBackupMessaging([...fixture.archive.localStorage, entry(state())], owners);
    expect(review.checks[0]).toMatchObject({ status: "invalid", documents: 2 }); expect(review.checks[0].records).toBeUndefined();
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "invalid-message-state", recordId: mailbox }));
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "unchecked-message-contact", referenceId: database }));
  });

  it("uses canonical encoded owner IDs without trimming them or confusing changed roles with missing owners", async () => {
    const id = "student/a:b%20"; const key = `bi-university-messages-v2:teacher:${encodeURIComponent(id)}`;
    expect((await inspectBackupMessaging([entry(state(), key)], new Set([id, "teacher-1"]))).issues).toEqual([]);
    for (const bad of [key.replace("%2F", "%2f"), "bi-university-messages-v2:student:%GG", "bi-university-messages-v2:admin:student-1", "bi-university-messages-v2:student:", "bi-university-messages-v4"]) {
      const review = await inspectBackupMessaging([entry(state(), bad)], owners);
      expect(review.checks[0].status).toBe("invalid"); expect(review.issues[0].code).toBe("unsupported-messaging-key");
    }
  });

  it("distinguishes missing archived accounts from unavailable account validation", async () => {
    const source = [entry(state())];
    expect((await inspectBackupMessaging(source)).issues).toContainEqual(expect.objectContaining({ code: "unchecked-message-owner", level: "review" }));
    expect((await inspectBackupMessaging(source, new Set())).issues).toContainEqual(expect.objectContaining({ code: "missing-message-owner", level: "error" }));
  });

  it("keeps malformed JSON private and rejects unknown database versions and mailbox keys", async () => {
    const source = [{ key: database, raw: '{"PRIVATE CONTENT"' }];
    expect(JSON.stringify(await inspectBackupMessaging(source, owners))).not.toContain("PRIVATE");
    expect((await inspectBackupMessaging([entry({ version: 99, users: {} }, database)], owners)).checks[0].status).toBe("invalid");
    const review = await inspectBackupMessaging([entry({ version: 1, users: { unknown: state(), [mailbox]: state() } }, database)], owners);
    expect(review.checks[0].status).toBe("invalid"); expect(review.issues[0]).toMatchObject({ code: "unsupported-message-mailbox", recordId: "unknown" });
  });

  it("reports unresolved replies as review, and duplicate deliveries and attachment IDs as errors at specific message IDs", async () => {
    const value = state(); Object.assign(value.messages["teacher-1"][0], { deliveryId: "delivery-1", replyTo: 99 });
    value.messages["teacher-1"].push({ ...value.messages["teacher-1"][0], id: 2 });
    Object.assign(value.messages["teacher-1"][1], { attachments: [{ id: "file", name: "PRIVATE", type: "", size: 1 }, { id: "file", name: "PRIVATE", type: "", size: 1 }] });
    const review = await inspectBackupMessaging([entry(value)], owners);
    expect(review.checks[0].status).toBe("valid");
    expect(review.issues.filter((issue) => issue.code === "unchecked-message-reply")).toHaveLength(2);
    for (const code of ["duplicate-message-delivery", "duplicate-message-attachments"]) expect(review.issues).toContainEqual(expect.objectContaining({ code, level: "error", recordId: JSON.stringify([mailbox, "teacher-1", 2]) }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("does not declare built-in contacts or former group members corrupt or fabricate group definitions", async () => {
    const value = { ...state(), dialogIds: ["group-112", "conversation-1"], groups: [{ id: "conversation-1", name: "PRIVATE GROUP", createdAt: 0, memberIds: ["teacher-1", "unknown-member"] }], leftGroupIds: ["conversation-1"], messages: { "conversation-1": [{ id: 1, incoming: true, text: "PRIVATE", time: "12:00" }] } };
    const review = await inspectBackupMessaging([entry(value)], owners);
    expect(review.issues.every((issue) => issue.level === "review")).toBe(true);
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "unchecked-message-members" }));
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "unchecked-message-contact", recordId: JSON.stringify([mailbox, "group-112"]) }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("keeps duplicate dialog and member findings separate, without silently deduplicating", async () => {
    const value = { ...state(), dialogIds: ["teacher-1", "teacher-1"], groups: [{ id: "g", name: "PRIVATE", createdAt: 0, memberIds: ["student-1", "student-1"] }] };
    const source = entry(value); const raw = source.raw; const review = await inspectBackupMessaging([source], owners);
    for (const code of ["duplicate-message-identifiers", "duplicate-message-members"]) expect(review.issues).toContainEqual(expect.objectContaining({ code, level: "error" }));
    expect(source.raw).toBe(raw);
  });

  it("treats prototype-like IDs as literal dialog keys, and flags unlisted messages", async () => {
    const value = { ...state(), dialogIds: ["__proto__", "constructor"] };
    const review = await inspectBackupMessaging([entry(value)], owners);
    expect(review.checks[0]).toMatchObject({ status: "valid", records: 1 });
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "unlisted-message-dialog", recordId: JSON.stringify([mailbox, "teacher-1"]) }));
  });

  it("retains all findings beyond 200 in one summary and supports cancellation inside a large thread", async () => {
    const value = state(); value.messages["teacher-1"] = Array.from({ length: 300 }, (_, id) => ({ id, incoming: false, text: "PRIVATE", time: "12:00", replyTo: 999 }));
    const source = [entry(value)]; const review = await inspectBackupMessaging(source, owners);
    expect(review.checks).toHaveLength(1); expect(review.issues).toHaveLength(300); expect(review.checks[0].records).toBe(300);
    const controller = new AbortController(); const promise = inspectBackupMessaging(source, owners, controller.signal); controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" }); expect(forbidden).not.toHaveBeenCalled();
  });

  it("distinguishes absence from an explicitly empty database", async () => {
    expect((await inspectBackupMessaging([])).checks[0]).toMatchObject({ status: "absent", documents: 0 });
    const review = await inspectBackupMessaging([entry({ version: 1, users: {} }, database)], owners);
    expect(review.checks[0]).toMatchObject({ status: "valid", records: 0 }); expect(review.issues).toEqual([]);
  });
});
