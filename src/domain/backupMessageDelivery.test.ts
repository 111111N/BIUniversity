import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessagingState, StoredMessage } from "../data/messageStore";
import { inspectArchivedMessageDelivery, type ArchivedMessageMailbox } from "./backupMessageDelivery";
import { inspectBackupMessaging } from "./backupMessagingDocuments";

const studentKey = "bi-university-messages-v2:student:student-1";
const teacherKey = "bi-university-messages-v2:teacher:teacher-1";
const owners = new Set(["student-1", "teacher-1"]);
const row = (patch: Partial<StoredMessage> = {}): StoredMessage => ({ id: 1, incoming: false, text: "PRIVATE MESSAGE", time: "12:00", sentAt: "2026-10-29T12:00:00Z", deliveryId: "delivery-1", ...patch });
const state = (contact: string, rows: StoredMessage[]): MessagingState => ({ dialogIds: [contact], messages: { [contact]: rows }, unread: { students: 0, teachers: 0, groups: 0 } });
const fixture = () => {
  const own = state("teacher-1", [row()]); const peer = state("student-1", [row({ incoming: true })]);
  const mailboxes = new Map<string, ArchivedMessageMailbox>([[studentKey, { ownerId: "student-1", state: own }], [teacherKey, { ownerId: "teacher-1", state: peer }]]);
  return { own, peer, mailboxes };
};
const replyFixture = () => {
  const f = fixture();
  f.own.messages["teacher-1"].push(row({ id: 2, deliveryId: "delivery-2", text: "PRIVATE OTHER SOURCE" }), row({ id: 3, deliveryId: "delivery-3", replyTo: 1 }));
  f.peer.messages["student-1"].push(row({ id: 2, deliveryId: "delivery-2", incoming: true, text: "PRIVATE OTHER SOURCE" }), row({ id: 3, deliveryId: "delivery-3", incoming: true, replyTo: 1 }));
  return f;
};
const forbidden = vi.fn(() => { throw new Error("Read-only delivery inspection must not access live messaging or files"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); vi.stubGlobal("window", { dispatchEvent: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("archived v3 direct message delivery", () => {
  it("confirms replies by source delivery identity, without changing reply pointers or exposing text", async () => {
    const f = replyFixture(); const before = JSON.stringify([...f.mailboxes]);
    expect(await inspectArchivedMessageDelivery(f.mailboxes, owners)).toEqual({ issues: [], comparedPairs: 3 });
    expect(JSON.stringify([...f.mailboxes])).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });

  it("accepts different reply numbers pointing to the same delivered source after renumbering", async () => {
    const f = replyFixture(); f.peer.messages["student-1"][0].id = 10; f.peer.messages["student-1"][2].replyTo = 10;
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.comparedPairs).toBe(3);
    expect(review.issues).toEqual([expect.objectContaining({ code: "different-delivery-numbers", level: "review" })]);
  });

  it("supports a source numbered zero without treating its reply pointer as absent", async () => {
    const f = replyFixture(); f.own.messages["teacher-1"][0].id = 0; f.peer.messages["student-1"][0].id = 0;
    f.own.messages["teacher-1"][2].replyTo = 0; f.peer.messages["student-1"][2].replyTo = 0;
    expect(await inspectArchivedMessageDelivery(f.mailboxes, owners)).toEqual({ issues: [], comparedPairs: 3 });
  });

  it("finds a reply conflict even when equal numeric pointers identify different delivered messages", async () => {
    const f = replyFixture(); f.peer.messages["student-1"][0].id = 2; f.peer.messages["student-1"][1].id = 1;
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "message-copy-mismatch", level: "error", recordId: JSON.stringify([studentKey, "teacher-1", 3]), message: expect.stringContaining("ссылка ответа") }));
    expect(review.issues.filter((issue) => issue.code === "message-copy-mismatch")).toHaveLength(1);
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("compares reply targets once and combines their conflict with other conflicting fields", async () => {
    const f = replyFixture(); Object.assign(f.peer.messages["student-1"][2], { replyTo: 2, text: "PRIVATE CONFLICT" });
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.issues).toHaveLength(1); expect(review.issues[0]).toMatchObject({ code: "message-copy-mismatch", level: "error" });
    expect(review.issues[0].message).toContain("текст, ссылка ответа"); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it.each(["own", "peer"] as const)("reviews a reply pointer missing in the %s copy instead of inventing one", async (side) => {
    const f = replyFixture(); delete f[side].messages[side === "own" ? "teacher-1" : "student-1"][2].replyTo;
    const before = JSON.stringify([...f.mailboxes]); const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.issues).toEqual([expect.objectContaining({ code: "incomplete-message-reply", level: "review", recordId: JSON.stringify([studentKey, "teacher-1", 3]) })]);
    expect(JSON.stringify([...f.mailboxes])).toBe(before);
  });

  it("does not infer a common reply source from equal numbers or text when old sources lack delivery IDs", async () => {
    const f = replyFixture();
    for (const [mailbox, contact] of [[f.own, "teacher-1"], [f.peer, "student-1"]] as const) {
      delete mailbox.messages[contact][0].deliveryId; delete mailbox.messages[contact][0].sentAt;
    }
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.comparedPairs).toBe(2); expect(review.issues).toEqual([expect.objectContaining({ code: "unidentified-reply-target", level: "review" })]);
  });

  it("does not choose an arbitrary original when its delivery ID is duplicated", async () => {
    const f = replyFixture(); f.own.messages["teacher-1"][1].deliveryId = "delivery-1";
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "ambiguous-reply-target", level: "review" }));
    expect(review.issues.some((issue) => issue.code === "message-copy-mismatch")).toBe(false);
  });

  it("leaves deleted or self-referencing originals to the existing local-reference check", async () => {
    for (const replyTo of [99, 3]) {
      const f = replyFixture(); f.peer.messages["student-1"][2].replyTo = replyTo;
      const archive = [{ key: "bi-university-messages-v3", raw: JSON.stringify({ version: 1, users: { [studentKey]: f.own, [teacherKey]: f.peer } }) }];
      const review = await inspectBackupMessaging(archive, owners);
      expect(review.issues).toEqual([expect.objectContaining({ code: "unchecked-message-reply", level: "review", recordId: JSON.stringify([teacherKey, "student-1", 3]) })]);
    }
  });

  it("retains every reply conflict beyond 200 without dropping later findings", async () => {
    const f = replyFixture(); f.own.messages["teacher-1"].splice(2); f.peer.messages["student-1"].splice(2);
    for (let id = 3; id < 263; id++) {
      f.own.messages["teacher-1"].push(row({ id, deliveryId: `reply-${id}`, replyTo: 1 }));
      f.peer.messages["student-1"].push(row({ id, deliveryId: `reply-${id}`, incoming: true, replyTo: 2 }));
    }
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.comparedPairs).toBe(262); expect(review.issues).toHaveLength(260);
    expect(review.issues.at(-1)).toMatchObject({ code: "message-copy-mismatch", recordId: JSON.stringify([studentKey, "teacher-1", 262]) });
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(forbidden).not.toHaveBeenCalled();
  });
  it("compares each pair once, handles both directions and never changes or reveals sources", async () => {
    const f = fixture(); f.peer.messages["student-1"].push(row({ id: 2, incoming: false, deliveryId: "delivery-2" })); f.own.messages["teacher-1"].push(row({ id: 2, incoming: true, deliveryId: "delivery-2" }));
    const before = JSON.stringify([...f.mailboxes]); const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review).toEqual({ issues: [], comparedPairs: 2 }); expect(JSON.stringify([...f.mailboxes])).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });

  it("allows recipient file IDs to differ and equivalent instants to use different timezone text", async () => {
    const f = fixture();
    f.own.messages["teacher-1"][0].attachments = [{ id: "sender-file", name: "PRIVATE NAME", type: "PRIVATE TYPE", size: 10 }];
    Object.assign(f.peer.messages["student-1"][0], { attachments: [{ id: "recipient-file", name: "PRIVATE NAME", type: "PRIVATE TYPE", size: 10 }], sentAt: "2026-10-29T15:00:00+03:00", time: "сегодня" });
    expect(await inspectArchivedMessageDelivery(f.mailboxes, owners)).toEqual({ issues: [], comparedPairs: 1 });
  });

  it.each([
    [{ text: "PRIVATE CONFLICT" }, "текст"], [{ incoming: false }, "направление"], [{ sentAt: "2026-10-29T12:01:00Z" }, "время отправки"],
    [{ attachments: [{ id: "file", name: "PRIVATE FILE", type: "text/plain", size: 1 }] }, "метаданные вложений"],
  ] as const)("reports conflicting copies by field name, never by content: %s", async (patch, field) => {
    const f = fixture(); Object.assign(f.peer.messages["student-1"][0], patch);
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.comparedPairs).toBe(1); expect(review.issues).toHaveLength(1);
    expect(review.issues[0]).toMatchObject({ code: "message-copy-mismatch", level: "error", referenceId: "bi-university-messages-v3", recordId: JSON.stringify([studentKey, "teacher-1", 1]) });
    expect(review.issues[0].message).toContain(field); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("combines several conflicting fields into one finding per pair", async () => {
    const f = fixture(); Object.assign(f.peer.messages["student-1"][0], { text: "PRIVATE DIFFERENT", incoming: false, sentAt: "2026-10-29T12:02:00Z" });
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.issues).toHaveLength(1); expect(review.issues[0].message).toContain("направление, текст, время отправки");
  });

  it("treats missing copies as review after one-sided deletion, without declaring a failed send", async () => {
    const f = fixture(); f.peer.messages = {}; f.peer.dialogIds = [];
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.comparedPairs).toBe(0); expect(review.issues).toEqual([expect.objectContaining({ level: "review", code: "missing-message-copy" })]);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("also reviews an incoming copy whose outgoing counterpart was removed", async () => {
    const f = fixture(); f.own.messages = {};
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.issues).toEqual([expect.objectContaining({ level: "review", code: "missing-message-copy", recordId: JSON.stringify([teacherKey, "student-1", 1]) })]);
  });

  it.each(["absent", "unreadable"])("keeps a %s peer distinct from a missing message", async (kind) => {
    const f = fixture(); if (kind === "absent") f.mailboxes.delete(teacherKey); else f.mailboxes.set(teacherKey, { ownerId: "teacher-1" });
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.issues).toEqual([expect.objectContaining({ level: "review", code: "unchecked-delivery-mailbox", recordId: JSON.stringify([studentKey, "teacher-1"]) })]);
  });

  it("does not pick one historical role when either owner has multiple current-generation mailboxes", async () => {
    const f = fixture(); f.mailboxes.set("bi-university-messages-v2:student:teacher-1", { ownerId: "teacher-1", state: state("student-1", [row({ incoming: true })]) });
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.comparedPairs).toBe(0); expect(review.issues).toHaveLength(3);
    expect(review.issues.every((issue) => issue.code === "ambiguous-delivery-mailbox" && issue.level === "review")).toBe(true);
  });

  it("does not match duplicated delivery IDs by choosing an arbitrary message", async () => {
    const f = fixture(); f.peer.messages["student-1"].push(row({ id: 2, incoming: true, text: "PRIVATE DIFFERENT" }));
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.comparedPairs).toBe(0); expect(review.issues).toEqual([expect.objectContaining({ code: "ambiguous-message-delivery", level: "review" })]);
  });

  it("ignores unknown contact types and groups without inferring people from their messages", async () => {
    const f = fixture(); f.own.groups = [{ id: "teacher-1", name: "PRIVATE GROUP", memberIds: ["student-1"], createdAt: 0 }];
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.comparedPairs).toBe(0); expect(review.issues).toEqual([expect.objectContaining({ code: "ambiguous-delivery-contact", level: "review" })]);
    expect((await inspectArchivedMessageDelivery(f.mailboxes)).comparedPairs).toBe(0);
  });

  it("does not require direct delivery IDs on ordinary group messages", async () => {
    const f = fixture(); f.mailboxes.delete(teacherKey);
    f.own.groups = [{ id: "teacher-1", name: "PRIVATE GROUP", memberIds: ["student-1", "teacher-1"], createdAt: 0 }];
    delete f.own.messages["teacher-1"][0].deliveryId;
    expect(await inspectArchivedMessageDelivery(f.mailboxes, owners)).toEqual({ issues: [], comparedPairs: 0 });
  });

  it("never matches legacy messages by numeric ID, text or time, even if all three agree", async () => {
    const f = fixture(); delete f.own.messages["teacher-1"][0].deliveryId; delete f.peer.messages["student-1"][0].deliveryId;
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.comparedPairs).toBe(0); expect(review.issues).toHaveLength(2); expect(review.issues.every((issue) => issue.code === "unidentified-message-delivery")).toBe(true);
    delete f.own.messages["teacher-1"][0].sentAt; delete f.peer.messages["student-1"][0].sentAt;
    expect((await inspectArchivedMessageDelivery(f.mailboxes, owners)).issues).toEqual([]);
  });

  it("keeps optional times and differing message numbers as review, preserving original reply references", async () => {
    const f = fixture(); delete f.peer.messages["student-1"][0].sentAt; f.peer.messages["student-1"][0].id = 42;
    const before = JSON.stringify([...f.mailboxes]); const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.comparedPairs).toBe(1);
    for (const code of ["incomplete-delivery-time", "different-delivery-numbers"]) expect(review.issues).toContainEqual(expect.objectContaining({ code, level: "review" }));
    expect(JSON.stringify([...f.mailboxes])).toBe(before);
  });

  it("does not borrow a legacy mailbox when the v3 peer is missing or unreadable", async () => {
    const f = fixture();
    const entries = [
      { key: "bi-university-messages-v3", raw: JSON.stringify({ version: 1, users: { [studentKey]: f.own, [teacherKey]: { dialogIds: "PRIVATE BROKEN" } } }) },
      { key: teacherKey, raw: JSON.stringify(f.peer) },
    ];
    const review = await inspectBackupMessaging(entries, owners);
    expect(review.checks[0].status).toBe("invalid"); expect(review.checks[0].message).toContain("Сопоставлено пар личных сообщений в общем документе: 0");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "unchecked-delivery-mailbox" })); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("does not flag the same delivery ID reused in a different conversation as a cross-dialog conflict", async () => {
    const f = fixture(); const thirdKey = "bi-university-messages-v2:teacher:teacher-2";
    f.own.messages["teacher-2"] = [row({ id: 3 })]; f.own.dialogIds.push("teacher-2");
    f.mailboxes.set(thirdKey, { ownerId: "teacher-2", state: state("student-1", [row({ id: 3, incoming: true })]) });
    expect(await inspectArchivedMessageDelivery(f.mailboxes, new Set([...owners, "teacher-2"]))).toEqual({ issues: [], comparedPairs: 2 });
  });

  it("handles hundreds of pairs, retains every mismatch and cancels without returning a partial report", async () => {
    const f = fixture();
    f.own.messages["teacher-1"] = Array.from({ length: 300 }, (_, id) => row({ id, deliveryId: `delivery-${id}` }));
    f.peer.messages["student-1"] = f.own.messages["teacher-1"].map((item) => ({ ...item, incoming: true, text: "PRIVATE DIFFERENT" }));
    const review = await inspectArchivedMessageDelivery(f.mailboxes, owners);
    expect(review.comparedPairs).toBe(300); expect(review.issues).toHaveLength(300); expect(review.issues.at(-1)?.recordId).toBe(JSON.stringify([studentKey, "teacher-1", 299]));
    const controller = new AbortController(); const pending = inspectArchivedMessageDelivery(f.mailboxes, owners, controller.signal); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" }); expect(forbidden).not.toHaveBeenCalled();
  });
});
