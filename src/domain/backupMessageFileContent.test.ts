import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { inspectArchivedMessageAttachments, type ArchivedMessageAttachmentReference } from "./backupMessageAttachments";
import type { ArchivedAttachmentPair } from "./backupMessageDelivery";
import { messageFileBackupFixture, replaceMessageFileBlob } from "../testSupport/localBackupDocuments";

const ownKey = "bi-university-messages-v2:student:student-1"; const peerKey = "bi-university-messages-v2:teacher:teacher-1";
const forbidden = vi.fn(() => { throw new Error("Content comparison must not read live files, decode Base64 or create downloads"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); vi.stubGlobal("atob", forbidden); });
afterEach(() => vi.unstubAllGlobals());
const fixture = async () => {
  const f = await messageFileBackupFixture();
  const own = { mailbox: ownKey, dialog: "teacher-1", messageId: 1, attachments: [f.ownAttachment] };
  const peer = { mailbox: peerKey, dialog: "student-1", messageId: 1, attachments: [f.peerAttachment] };
  const pairs: ArchivedAttachmentPair[] = [{ own, peer }];
  const references: ArchivedMessageAttachmentReference[] = [
    { key: f.messagingKey, ...own, expectedScope: "student:student-1:teacher-1", attachment: f.ownAttachment },
    { key: f.messagingKey, ...peer, expectedScope: "teacher:teacher-1:student-1", attachment: f.peerAttachment },
  ];
  return { ...f, pairs, references };
};
const messageSummary = (review: Awaited<ReturnType<typeof inspectBackupDocuments>>) => review.checks.find((check) => check.kind === "messaging")?.message;

describe("archived attachment content pairs", () => {
  it("compares one pair with different IDs without changing the archive or revealing binary values", async () => {
    const f = await fixture(); const before = JSON.stringify(f.archive);
    const review = await inspectBackupDocuments(f.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 12, errors: 0, reviews: 0 });
    expect(messageSummary(review)).toContain("Сопоставлено пар вложений по содержимому: 1");
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review)).not.toContain("base64"); expect(JSON.stringify(f.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });

  it("finds changed bytes despite identical names, types, sizes and delivery IDs, once per pair", async () => {
    const f = await fixture(); await replaceMessageFileBlob(f.records[1], new File(["PRIVATE FILE BODX"], f.peerAttachment.name, { type: f.peerAttachment.type }));
    const before = JSON.stringify(f.archive); const review = await inspectBackupDocuments(f.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 12, invalid: 0, errors: 1, reviews: 0 });
    expect(review.issues).toEqual([expect.objectContaining({ code: "message-attachment-content-mismatch", level: "error", referenceId: f.messagingKey, recordId: JSON.stringify([ownKey, "teacher-1", 1, "own-file"]) })]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review)).not.toContain("base64"); expect(JSON.stringify(f.archive)).toBe(before);
  });

  it("ignores File modification times when the actual saved bytes agree", async () => {
    const f = await fixture(); await replaceMessageFileBlob(f.records[1], new File(["PRIVATE FILE BODY"], f.peerAttachment.name, { type: f.peerAttachment.type, lastModified: 999 }));
    expect((await inspectBackupDocuments(f.archive, "configurator-demo")).issues).toEqual([]);
  });

  it.each(["missing", "scope", "metadata", "blob"])("does not claim a content check for an invalid %s link", async (kind) => {
    const f = await fixture(); const entry = f.records[0].value;
    if (entry.type !== "object") throw new Error("Missing fixture");
    if (kind === "missing") f.records.shift();
    else if (kind === "scope") entry.entries.find(([key]) => key === "scope")![1] = { type: "string", value: "student:other:teacher-1" };
    else if (kind === "metadata") { f.ownAttachment.name = "PRIVATE OTHER NAME"; f.save(); }
    else entry.entries.find(([key]) => key === "blob")![1] = { type: "undefined" };
    const review = await inspectBackupDocuments(f.archive, "configurator-demo");
    expect(messageSummary(review)).toContain("Сопоставлено пар вложений по содержимому: 0");
    expect(review.issues.some((issue) => issue.code === "message-attachment-content-mismatch")).toBe(false); expect(review.counts.errors).toBeGreaterThan(0);
  });

  it.each(["direction", "duplicate", "owner", "group", "file-id"])("does not pair attachments through an ambiguous %s", async (kind) => {
    const f = await fixture(); const own = f.messaging.users[ownKey]; const peer = f.messaging.users[peerKey];
    if (kind === "direction") peer.messages["student-1"][0].incoming = false;
    else if (kind === "duplicate") peer.messages["student-1"].push({ ...peer.messages["student-1"][0], id: 2 });
    else if (kind === "owner") Object.assign(f.messaging.users, { "bi-university-messages-v2:student:teacher-1": peer });
    else if (kind === "group") Object.assign(own, { groups: [{ id: "teacher-1", name: "PRIVATE GROUP", createdAt: 0, memberIds: ["student-1", "teacher-1"] }] });
    else {
      Object.assign(own.messages["teacher-1"][0], { attachments: [f.ownAttachment, f.ownAttachment] });
      Object.assign(peer.messages["student-1"][0], { attachments: [f.peerAttachment, f.peerAttachment] });
    }
    f.save(); const review = await inspectBackupDocuments(f.archive, "configurator-demo");
    expect(messageSummary(review)).toContain("Сопоставлено пар вложений по содержимому: 0");
    expect(review.issues.some((issue) => issue.code === "message-attachment-content-mismatch")).toBe(false);
  });

  it("never borrows a legacy mailbox when the current counterpart is missing", async () => {
    const f = await fixture(); const own = f.messaging.users[ownKey]; const peer = f.messaging.users[peerKey];
    f.archive.localStorage.find((entry) => entry.key === f.messagingKey)!.raw = JSON.stringify({ version: 1, users: { [ownKey]: own } });
    f.archive.localStorage.push({ key: peerKey, raw: JSON.stringify(peer) });
    const review = await inspectBackupDocuments(f.archive, "configurator-demo");
    expect(messageSummary(review)).toContain("Сопоставлено пар вложений по содержимому: 0");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "unchecked-delivery-mailbox" }));
  });

  it("does not use a legacy reference to validate a mismatched current reference with the same message number", async () => {
    const f = await fixture(); const ownLegacy = JSON.parse(JSON.stringify(f.messaging.users[ownKey])); const peerLegacy = JSON.parse(JSON.stringify(f.messaging.users[peerKey]));
    f.ownAttachment.name = "PRIVATE WRONG NAME"; f.peerAttachment.name = "PRIVATE WRONG NAME"; f.save();
    f.archive.localStorage.push({ key: ownKey, raw: JSON.stringify(ownLegacy) }, { key: peerKey, raw: JSON.stringify(peerLegacy) });
    const review = await inspectBackupDocuments(f.archive, "configurator-demo");
    expect(messageSummary(review)).toContain("Сопоставлено пар вложений по содержимому: 0");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "message-attachment-metadata-mismatch", referenceId: f.messagingKey }));
  });

  it("compares empty files as an actual pair", async () => {
    const f = await fixture();
    for (let index = 0; index < 2; index++) {
      const meta = index ? f.peerAttachment : f.ownAttachment; meta.size = 0;
      const value = f.records[index].value;
      if (value.type !== "object") throw new Error("Missing fixture");
      value.entries.find(([key]) => key === "size")![1] = { type: "number", value: 0 };
      await replaceMessageFileBlob(f.records[index], new File([], meta.name, { type: meta.type }));
    }
    const review = await inspectArchivedMessageAttachments(f.references, f.archive.databases, undefined, f.pairs);
    expect(review.issues).toEqual([]); expect(review.summary).toContain("Сопоставлено пар вложений по содержимому: 1");
  });

  it("checks a large common prefix and supports cancellation during chunked comparison", async () => {
    const f = await fixture(); const encodedSize = 1_048_576;
    for (let index = 0; index < 2; index++) {
      const meta = index ? f.peerAttachment : f.ownAttachment; meta.size = encodedSize * 3 / 4;
      const value = f.records[index].value;
      if (value.type !== "object") throw new Error("Missing fixture");
      value.entries.find(([key]) => key === "size")![1] = { type: "number", value: meta.size };
      value.entries.find(([key]) => key === "blob")![1] = { type: "blob", size: meta.size, mediaType: meta.type, base64: "A".repeat(encodedSize - 1) + (index ? "B" : "A") };
    }
    const review = await inspectArchivedMessageAttachments(f.references, f.archive.databases, undefined, f.pairs);
    expect(review.issues).toEqual([expect.objectContaining({ code: "message-attachment-content-mismatch" })]);
    const controller = new AbortController(); const pending = inspectArchivedMessageAttachments(f.references, f.archive.databases, controller.signal, f.pairs);
    const timer = setTimeout(() => controller.abort(), 0);
    try { await expect(pending).rejects.toMatchObject({ name: "AbortError" }); } finally { clearTimeout(timer); }
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("retains all conflicting attachment references beyond 200, including repeated physical file pairs", async () => {
    const f = await fixture(); await replaceMessageFileBlob(f.records[1], new File(["PRIVATE FILE BODX"], f.peerAttachment.name, { type: f.peerAttachment.type }));
    const pairs: ArchivedAttachmentPair[] = []; const references: ArchivedMessageAttachmentReference[] = [];
    for (let messageId = 0; messageId < 250; messageId++) {
      pairs.push({ own: { ...f.pairs[0].own, messageId }, peer: { ...f.pairs[0].peer, messageId } });
      references.push(...f.references.map((reference) => ({ ...reference, messageId })));
    }
    const review = await inspectArchivedMessageAttachments(references, f.archive.databases, undefined, pairs);
    expect(review.issues).toHaveLength(250); expect(review.summary).toContain("Сопоставлено пар вложений по содержимому: 250");
    expect(review.issues.at(-1)?.recordId).toBe(JSON.stringify([ownKey, "teacher-1", 249, "own-file"])); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
});
