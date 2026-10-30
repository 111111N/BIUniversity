import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectArchivedMessageAttachments, type ArchivedMessageAttachmentReference } from "./backupMessageAttachments";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { inspectBackupMessaging } from "./backupMessagingDocuments";
import { messageFileBackupFixture } from "../testSupport/localBackupDocuments";
import type { BackupValue } from "./localBackup";

const forbidden = vi.fn(() => { throw new Error("File inspection must not read live stores or decode archived binary data"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); vi.stubGlobal("atob", forbidden); });
afterEach(() => vi.unstubAllGlobals());
const fixture = async () => {
  const f = await messageFileBackupFixture();
  const references: ArchivedMessageAttachmentReference[] = [
    { key: f.messagingKey, mailbox: "bi-university-messages-v2:student:student-1", dialog: "teacher-1", messageId: 1, expectedScope: "student:student-1:teacher-1", attachment: f.ownAttachment },
    { key: f.messagingKey, mailbox: "bi-university-messages-v2:teacher:teacher-1", dialog: "student-1", messageId: 1, expectedScope: "teacher:teacher-1:student-1", attachment: f.peerAttachment },
  ];
  const set = (name: string, value: BackupValue) => {
    const fields = f.records[0].value;
    if (fields.type !== "object") throw new Error("Invalid file fixture");
    const field = fields.entries.find(([key]) => key === name);
    if (!field) throw new Error("Missing fixture field"); field[1] = value;
  };
  return { ...f, references, set, store: f.archive.databases[1].stores[0] };
};

describe("archived message attachment links", () => {
  it("checks actual encoded files, separate sender/recipient IDs and scope without decoding binary or changing archives", async () => {
    const f = await fixture(); const before = JSON.stringify(f.archive);
    const review = await inspectBackupDocuments(f.archive, "configurator-demo");
    expect(review.counts).toEqual({ valid: 12, invalid: 0, absent: 1, unchecked: 0, errors: 0, reviews: 0 });
    expect(review.checks.find((check) => check.kind === "messaging")?.message).toContain("Файловых записей: 2; ссылок из читаемых сообщений: 2; записей без такой ссылки: 0");
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review)).not.toContain("base64"); expect(JSON.stringify(f.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });

  it("reports missing files at the exact message and attachment, without borrowing a recipient copy", async () => {
    const f = await fixture(); f.store.records.shift();
    const review = await inspectArchivedMessageAttachments(f.references, f.archive.databases);
    expect(review.issues).toEqual([expect.objectContaining({ code: "missing-message-attachment", level: "error", referenceId: f.messagingKey, recordId: JSON.stringify([f.references[0].mailbox, "teacher-1", 1, "own-file"]) })]);
  });

  it("distinguishes a missing file database from successful attachment checks", async () => {
    const f = await fixture(); f.archive.databases[1].version = null; f.archive.databases[1].stores = [];
    const review = await inspectArchivedMessageAttachments(f.references, f.archive.databases);
    expect(review.issues.filter((issue) => issue.code === "missing-message-attachment")).toHaveLength(2);
  });

  it.each(["student:other-user:teacher-1", "student:student-1:other-dialog", "teacher:student-1:teacher-1"])("rejects a file from another scope: %s", async (scope) => {
    const f = await fixture(); f.set("scope", { type: "string", value: scope });
    const review = await inspectArchivedMessageAttachments(f.references, f.archive.databases);
    expect(review.issues).toEqual([expect.objectContaining({ code: "message-attachment-scope-mismatch", level: "error" })]);
    expect(JSON.stringify(review)).not.toContain(scope);
  });

  it.each(["name", "type", "size"] as const)("finds message/file metadata disagreement in %s without exposing values", async (field) => {
    const f = await fixture(); Object.assign(f.ownAttachment, { [field]: field === "size" ? 999 : "PRIVATE CONFLICT" });
    const review = await inspectArchivedMessageAttachments(f.references, f.archive.databases);
    expect(review.issues).toEqual([expect.objectContaining({ code: "message-attachment-metadata-mismatch", level: "error" })]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it.each(["id", "scope", "blob"])("does not silently repair an invalid file field %s", async (field) => {
    const f = await fixture(); f.set(field, { type: "undefined" });
    const review = await inspectArchivedMessageAttachments(f.references, f.archive.databases);
    expect(review.issues).toEqual([expect.objectContaining({ code: "invalid-message-file-record", recordId: '["file","own-file"]' })]);
  });

  it.each(["size", "mediaType", "name"])("finds blob metadata conflicts in %s without opening the file", async (field) => {
    const f = await fixture(); const blob = f.records[0].value.type === "object" ? f.records[0].value.entries.find(([key]) => key === "blob")?.[1] : undefined;
    if (blob?.type !== "blob") throw new Error("Missing blob fixture");
    if (field === "name") blob.file!.name = "PRIVATE DIFFERENT NAME";
    else if (field === "size") { f.ownAttachment.size++; f.set("size", { type: "number", value: f.ownAttachment.size }); }
    else blob.mediaType = "PRIVATE TYPE";
    const review = await inspectArchivedMessageAttachments(f.references, f.archive.databases);
    expect(review.issues).toEqual([expect.objectContaining({ code: "message-file-blob-mismatch", recordId: '["file","own-file"]' })]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(forbidden).not.toHaveBeenCalled();
  });

  it("keeps legacy role-only attachment ownership unverified instead of guessing a demo user", async () => {
    const f = await fixture(); delete f.references[0].expectedScope;
    const review = await inspectArchivedMessageAttachments(f.references, f.archive.databases);
    expect(review.issues).toEqual([expect.objectContaining({ code: "unchecked-message-attachment-owner", level: "review" })]);
    expect(JSON.stringify(review)).not.toContain("anna-smirnova");
  });

  it("builds scopes using encoded owner/contact IDs and historical mailbox roles", async () => {
    const f = await fixture(); const owner = "student/a:b%20"; const contact = "teacher/a:b%20";
    f.set("scope", { type: "string", value: `teacher:${encodeURIComponent(owner)}:${encodeURIComponent(contact)}` });
    f.store.records.pop();
    const key = `bi-university-messages-v2:teacher:${encodeURIComponent(owner)}`;
    const entries = [{ key, raw: JSON.stringify({ dialogIds: [contact], messages: { [contact]: [{ id: 1, incoming: false, text: "PRIVATE", time: "12:00", attachments: [f.ownAttachment] }] } }) }];
    const review = await inspectBackupMessaging(entries, new Set([owner, contact]), undefined, f.archive.databases);
    expect(review.issues).toEqual([]); expect(forbidden).not.toHaveBeenCalled();
  });

  it("does not declare unreferenced files safe to delete", async () => {
    const f = await fixture(); const before = JSON.stringify(f.archive);
    const review = await inspectArchivedMessageAttachments([], f.archive.databases);
    expect(review.summary).toContain("записей без такой ссылки: 2");
    expect(review.issues).toEqual([expect.objectContaining({ code: "unreferenced-message-files", level: "review" })]);
    expect(JSON.stringify(f.archive)).toBe(before);
  });

  it.each(["version", "keyPath", "generator"])("does not claim file checks passed under an unsupported %s", async (field) => {
    const f = await fixture();
    if (field === "version") f.archive.databases[1].version = 2;
    else if (field === "keyPath") f.store.keyPath = "another-field";
    else f.store.autoIncrement = true;
    const review = await inspectArchivedMessageAttachments(f.references, f.archive.databases);
    expect(review.issues).toEqual([expect.objectContaining({ code: "unsupported-message-files-store", level: "error" })]);
    expect(review.summary).toContain("ссылки вложений не проверены");
  });

  it("leaves additional index constraints for review", async () => {
    const f = await fixture(); f.store.indexes.push({ name: "scope", keyPath: "scope", unique: true, multiEntry: false });
    expect((await inspectArchivedMessageAttachments(f.references, f.archive.databases)).issues).toEqual([expect.objectContaining({ code: "unchecked-message-files-indexes", level: "review" })]);
  });

  it("keeps every missing reference beyond 200 and supports cancellation", async () => {
    const f = await fixture(); const references = Array.from({ length: 250 }, (_, messageId) => ({ ...f.references[0], messageId, attachment: { ...f.ownAttachment, id: `missing-${messageId}` } }));
    const review = await inspectArchivedMessageAttachments(references, f.archive.databases);
    expect(review.issues.filter((issue) => issue.code === "missing-message-attachment")).toHaveLength(250);
    expect(review.issues).toContainEqual(expect.objectContaining({ recordId: JSON.stringify([f.references[0].mailbox, "teacher-1", 249, "missing-249"]) }));
    const controller = new AbortController(); const pending = inspectArchivedMessageAttachments(references, f.archive.databases, controller.signal); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" }); expect(forbidden).not.toHaveBeenCalled();
  });
});
