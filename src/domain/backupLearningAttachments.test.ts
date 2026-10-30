import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectArchivedLearningAttachments } from "./backupLearningAttachments";
import { BACKUP_LEARNING_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";
import { learningFileBackupFixture, learningBackupFixture } from "../testSupport/localBackupDocuments";
import type { BackupValue } from "./localBackup";

const forbidden = vi.fn(() => { throw new Error("Learning file checks must not read live files or decode binary contents"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); vi.stubGlobal("atob", forbidden); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("archived task and answer files", () => {
  it("checks exact IDs and names for assignments, top-level answers and every attempt without exposing files", async () => {
    const fixture = await learningFileBackupFixture(); const before = JSON.stringify(fixture.archive);
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 6, invalid: 0, errors: 0, reviews: 0 });
    expect(review.checks.find((check) => check.kind === "assignments")!.message).toContain("Ссылок на учебные файлы из читаемых списков: 1; найдено файлов по ID: 1; сравнено имён: 1");
    expect(review.checks.find((check) => check.kind === "submissions")!.message).toContain("Ссылок на учебные файлы из читаемых списков: 2; найдено файлов по ID: 2; сравнено имён: 2");
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review)).not.toContain("base64"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });

  it("checks a missing historical attempt file even if the current answer and latest file are present", async () => {
    const fixture = await learningFileBackupFixture(); const latest = fixture.submissions[0].attempts![0];
    fixture.submissions[0].attempts = [{ ...latest, id: "old-attempt", attachmentId: "missing-old-file", status: "revision", number: 1 }, { ...latest, id: "new-attempt", number: 2 }];
    fixture.submissions[0].attemptCount = 2; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([expect.objectContaining({ kind: "submissions", code: "missing-learning-attachment", recordId: JSON.stringify(["submission", "answer-1", "attempt", "old-attempt", "missing-old-file"]) })]);
  });

  it("checks a conflicting top-level file independently rather than replacing it with the latest attempt", async () => {
    const fixture = await learningFileBackupFixture(); fixture.submissions[0].attachmentId = "missing-current-file"; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.map((issue) => issue.code)).toEqual(["missing-learning-attachment", "latest-attempt-mismatch"]);
    expect(review.issues[0].recordId).toBe(JSON.stringify(["submission", "answer-1", "current", "missing-current-file"]));
  });

  it("reports file-name conflicts without exposing either name or changing the reference", async () => {
    const fixture = await learningFileBackupFixture(); fixture.assignments[0].attachmentName = "PRIVATE CONFLICT.txt"; fixture.save(); const before = JSON.stringify(fixture.archive);
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([expect.objectContaining({ kind: "assignments", code: "learning-attachment-name-mismatch", referenceId: BACKUP_LEARNING_DOCUMENTS.assignments.key, recordId: JSON.stringify(["assignment", "task-1", "task-file"]) })]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });

  it("accepts legacy Blob files and absent names without inventing File metadata", async () => {
    const fixture = await learningFileBackupFixture(); const file = fixture.records[0].value;
    if (file.type !== "blob") throw new Error("Expected encoded file"); delete file.file;
    delete fixture.submissions[0].attachmentName; delete fixture.submissions[0].attempts![0].attachmentName; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo"); expect(review.issues).toEqual([]);
    expect(review.checks.find((check) => check.kind === "assignments")!.message).toContain("найдено файлов по ID: 1; сравнено имён: 0");
    expect(review.checks.find((check) => check.kind === "submissions")!.message).toContain("найдено файлов по ID: 2; сравнено имён: 0");
  });

  it.each([undefined, "", " "])("does not pick a file by name when the ID is %s", async (attachmentId) => {
    const fixture = await learningFileBackupFixture(); fixture.assignments[0].attachmentId = attachmentId; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.map((issue) => issue.code)).toEqual([attachmentId === undefined ? "learning-attachment-name-only" : "empty-learning-attachment-id", "unreferenced-learning-files"]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it.each([
    { type: "object", entries: [] }, { type: "string", value: "PRIVATE RAW" }, { type: "null" },
  ] as BackupValue[])("does not treat an invalid file record as an absent file: %j", async (value) => {
    const fixture = await learningFileBackupFixture(); fixture.records[0].value = value;
    const result = await inspectArchivedLearningAttachments(fixture.assignments, fixture.submissions, fixture.archive.databases);
    expect(result.issues).toEqual([expect.objectContaining({ code: "invalid-learning-file-record", referenceId: "bi-university-learning-files/files", recordId: JSON.stringify(["file", "task-file"]) })]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("requires string file keys and never borrows a file from another database", async () => {
    const fixture = await learningFileBackupFixture(); const [entry] = fixture.records.splice(0, 1);
    fixture.archive.databases[1] = { name: "bi-university-message-files", version: 1, capturedAt: fixture.archive.startedAt, stores: [{ name: "attachments", keyPath: "id", autoIncrement: false, indexes: [], records: [entry] }] };
    const result = await inspectArchivedLearningAttachments(fixture.assignments, fixture.submissions, fixture.archive.databases);
    expect(result.issues.map((issue) => issue.code)).toEqual(["missing-learning-attachment"]);
    fixture.records.push({ ...entry, key: { type: "number", value: 1 } });
    const invalid = await inspectArchivedLearningAttachments(fixture.assignments, fixture.submissions, fixture.archive.databases);
    expect(invalid.issues.map((issue) => issue.code)).toEqual(["invalid-learning-file-record", "missing-learning-attachment", "unreferenced-learning-files"]);
  });

  it.each(["version", "keyPath", "autoIncrement", "missing-store"])("does not claim missing files under an unsupported %s schema", async (change) => {
    const fixture = await learningFileBackupFixture(); const database = fixture.archive.databases[2];
    if (change === "version") database.version = 2;
    if (change === "keyPath") database.stores[0].keyPath = "id";
    if (change === "autoIncrement") database.stores[0].autoIncrement = true;
    if (change === "missing-store") database.stores.length = 0;
    const result = await inspectArchivedLearningAttachments(fixture.assignments, fixture.submissions, fixture.archive.databases);
    expect(result.issues.map((issue) => issue.code)).toEqual(["unsupported-learning-files-store"]);
    expect(result.summaries.assignments).toContain("записей без ссылки из читаемых заданий и ответов не проверено");
  });

  it("does not silently discard extra indexes or propose deleting unreferenced files", async () => {
    const fixture = await learningFileBackupFixture(); fixture.archive.databases[2].stores[0].indexes.push({ name: "name", keyPath: "name", unique: true, multiEntry: false });
    const result = await inspectArchivedLearningAttachments(undefined, undefined, fixture.archive.databases);
    expect(result.issues.map((issue) => issue.code)).toEqual(["unchecked-learning-files-indexes", "unreferenced-learning-files"]);
    expect(result.issues[1].message).toContain("это не основание для удаления");
  });

  it("does not call retained attempts of one workflow different owners, but reviews cross-context reuse", async () => {
    const fixture = await learningFileBackupFixture(); const original = fixture.submissions[0];
    fixture.submissions.push({ ...original, id: "other-answer", studentId: "other-student" });
    const result = await inspectArchivedLearningAttachments(fixture.assignments, fixture.submissions, fixture.archive.databases);
    expect(result.issues.map((issue) => issue.code)).toEqual(["shared-learning-attachment"]); expect(result.issues[0].level).toBe("review");
    expect(result.issues[0].message).toContain("В файловой записи нет владельца");
    const same = await inspectArchivedLearningAttachments(fixture.assignments, [original, { ...original, id: "duplicate-workflow" }], fixture.archive.databases);
    expect(same.issues).toEqual([]);
  });

  it("does not inspect a readable subset of broken source documents", async () => {
    const fixture = await learningFileBackupFixture();
    fixture.archive.localStorage.find((entry) => entry.key === BACKUP_LEARNING_DOCUMENTS.assignments.key)!.raw = JSON.stringify([fixture.assignments[0], { id: "broken" }]);
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues.map((issue) => issue.code)).toEqual(["invalid-document", "unreferenced-learning-files", "unchecked-assignment"]);
    expect(review.checks.find((check) => check.kind === "assignments")!.message).toContain("Ссылок на учебные файлы из читаемых списков: 0");
  });

  it("keeps empty sources quiet and reports links to an absent database as missing", async () => {
    const fixture = learningBackupFixture();
    expect((await inspectArchivedLearningAttachments(fixture.assignments, fixture.submissions, fixture.archive.databases)).issues).toEqual([]);
    fixture.assignments[0].attachmentId = "missing";
    expect((await inspectArchivedLearningAttachments(fixture.assignments, fixture.submissions, fixture.archive.databases)).issues).toEqual([expect.objectContaining({ code: "missing-learning-attachment" })]);
  });

  it("retains findings beyond 200 and cancels large reference and file-record scans", async () => {
    const fixture = await learningFileBackupFixture(); const assignments = Array.from({ length: 300 }, (_, index) => ({ ...fixture.assignments[0], id: `task-${index}`, attachmentId: `missing-${index}` }));
    const result = await inspectArchivedLearningAttachments(assignments, [], fixture.archive.databases);
    expect(result.issues.filter((issue) => issue.code === "missing-learning-attachment")).toHaveLength(300);
    expect(result.issues).toContainEqual(expect.objectContaining({ recordId: JSON.stringify(["assignment", "task-299", "missing-299"]) }));
    const records = Array.from({ length: 300 }, (_, index) => ({ ...fixture.records[0], key: { type: "string" as const, value: `file-${index}` } }));
    for (const scan of [(signal: AbortSignal) => inspectArchivedLearningAttachments(assignments, [], fixture.archive.databases, signal), (signal: AbortSignal) => inspectArchivedLearningAttachments([], [], [{ ...fixture.archive.databases[2], stores: [{ ...fixture.archive.databases[2].stores[0], records }] }], signal)]) {
      const controller = new AbortController(); const pending = scan(controller.signal); const timer = setTimeout(() => controller.abort(), 0);
      try { await expect(pending).rejects.toMatchObject({ name: "AbortError" }); } finally { clearTimeout(timer); }
    }
  });
});
