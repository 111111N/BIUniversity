import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveJournalTeachingArea } from "./journalTeachingArea";
import { inspectBackupJournals } from "./backupJournalDocuments";
import { BACKUP_CORE_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";
import { journalBackupFixture } from "../testSupport/localBackupDocuments";

const catalogs = (subjects = ["subject-1"], groups = ["group-1"]) => ({ subjectIds: new Set(subjects), groupIds: new Set(groups) });
const forbidden = vi.fn(() => { throw new Error("Teaching areas must only be resolved against archived catalogs"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("archived journal teaching areas", () => {
  it("matches a literal pair of archived IDs without editing input", async () => {
    const source = catalogs(); const before = JSON.stringify([[...source.subjectIds], [...source.groupIds]]);
    expect(await resolveJournalTeachingArea("subject-1:group-1", Object.freeze(source))).toEqual({ status: "matched", subjectId: "subject-1", groupId: "group-1" });
    expect(JSON.stringify([[...source.subjectIds], [...source.groupIds]])).toBe(before);
  });

  it.each([
    ["a:b", "c"], ["a", "b:c"], [" a ", " b "], ["%3A", "группа"], ["__proto__", "constructor"],
  ])("keeps separators, whitespace and encoded characters literal: %s / %s", async (subjectId, groupId) => {
    expect(await resolveJournalTeachingArea(`${subjectId}:${groupId}`, catalogs([subjectId], [groupId]))).toEqual({ status: "matched", subjectId, groupId });
  });

  it.each([
    ["missing:group-1", ["subject-1"], ["group-1"]],
    ["subject-1:missing", ["subject-1"], ["group-1"]],
    ["subject-1:group-1", [], []],
    ["subject-1:group-1:extra", ["subject-1"], ["group-1"]],
    ["SUBJECT-1:group-1", ["subject-1"], ["group-1"]],
    ["%3A:group-1", [":"], ["group-1"]],
    ["subject-1:group-1", ["subject"], ["1:group-1"]],
  ] as const)("does not guess or normalize unresolved keys: %s", async (scope, subjects, groups) => {
    expect(await resolveJournalTeachingArea(scope, { subjectIds: new Set(subjects), groupIds: new Set(groups) })).toEqual({ status: "unresolved" });
  });

  it.each([{}, { subjectIds: new Set(["subject-1"]) }, { groupIds: new Set(["group-1"]) }])("distinguishes an unavailable catalog from an empty saved one: %j", async (source) => {
    expect(await resolveJournalTeachingArea("subject-1:group-1", source)).toEqual({ status: "unavailable" });
  });

  it("reports ambiguous ID boundaries regardless of catalog order", async () => {
    for (const subjects of [["a", "a:b"], ["a:b", "a"]]) {
      expect(await resolveJournalTeachingArea("a:b:c", catalogs(subjects, ["b:c", "c"]))).toEqual({ status: "ambiguous" });
    }
  });

  it("keeps readable documents and original record counts separate from an unresolved key", async () => {
    const fixture = journalBackupFixture(); const before = JSON.stringify(fixture.archive);
    const result = await inspectBackupJournals(fixture.archive.localStorage, undefined, catalogs([], ["group-1"]));
    expect(result.checks.every((check) => check.status === "valid" && check.records === 1)).toBe(true);
    expect(result.issues.map((issue) => [issue.kind, issue.code, issue.referenceId])).toEqual([
      ["journals", "unresolved-journal-area", fixture.journalKey], ["journalHistory", "unresolved-journal-area", fixture.historyKey],
    ]);
    expect(result.checks.every((check) => check.message.includes("учебная область не подтверждена: 1"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });

  it("reports each ambiguous source list without choosing a subject/group boundary or merging records", async () => {
    const entries = ["journal", "journal-history"].map((prefix) => ({ key: `bi-university-${prefix}-v1:a:b:c`, raw: "[]" }));
    const before = JSON.stringify(entries); const review = await inspectBackupJournals(entries, undefined, catalogs(["a", "a:b"], ["b:c", "c"]));
    expect(review.issues.map((issue) => [issue.code, issue.referenceId])).toEqual(entries.map((entry) => ["ambiguous-journal-area", entry.key]));
    expect(review.checks.every((check) => check.status === "valid" && check.records === 0)).toBe(true); expect(JSON.stringify(entries)).toBe(before);
  });

  it("does not resolve areas from names, present memberships, or active group state", async () => {
    const fixture = journalBackupFixture(); fixture.groups.groups[0].status = "archived";
    fixture.groups.groups.push({ ...fixture.groups.groups[0], id: "group-2", name: "PRIVATE NEW GROUP", status: "active" });
    for (const account of fixture.accounts.accounts) {
      for (const membership of account.memberships) membership.groupIds = ["group-2"];
      if (account.role === "student") account.studentGroupId = "group-2";
    }
    fixture.subjects.subjects[0].name = "PRIVATE RENAMED SUBJECT"; fixture.save();
    const before = JSON.stringify(fixture.archive); const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.issues).toEqual([expect.objectContaining({ kind: "groups", code: "archived-group-draft" })]);
    expect(review.checks.filter((check) => check.kind === "journals" || check.kind === "journalHistory").every((check) => check.message.includes("Поддерживаемых ключей с однозначной парой ID из каталогов архива: 1"))).toBe(true);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });

  it.each(["groups", "subjects"] as const)("does not use browser baselines or readable subsets when %s are unavailable", async (kind) => {
    const fixture = journalBackupFixture();
    for (const raw of [undefined, "{broken", JSON.stringify({ version: 99 })]) {
      const entries = fixture.archive.localStorage.filter((entry) => entry.key !== BACKUP_CORE_DOCUMENTS[kind].key);
      if (raw !== undefined) entries.push({ key: BACKUP_CORE_DOCUMENTS[kind].key, raw });
      const review = await inspectBackupDocuments({ ...fixture.archive, localStorage: entries }, "configurator-demo", { groupIds: ["group-1"], requiredSubjectIds: [] });
      expect(review.issues.filter((issue) => issue.code === "unavailable-journal-area")).toEqual([
        expect.objectContaining({ kind: "journals", level: "review", referenceId: fixture.journalKey }),
        expect.objectContaining({ kind: "journalHistory", level: "review", referenceId: fixture.historyKey }),
      ]);
      expect(review.issues.some((issue) => issue.code === "unresolved-journal-area")).toBe(false);
    }
  });

  it("does not silently treat built-in groups as archived group definitions", async () => {
    const fixture = journalBackupFixture(); fixture.groups.groups.length = 0; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo", { groupIds: ["group-1"], requiredSubjectIds: [] });
    expect(review.issues.filter((issue) => issue.code === "unresolved-journal-area")).toHaveLength(2);
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "built-in-groups" }));
  });

  it("checks area keys independently of an unreadable journal without accepting a partial list", async () => {
    const fixture = journalBackupFixture(); fixture.archive.localStorage.find((entry) => entry.key === fixture.journalKey)!.raw = "[null]";
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    const check = review.checks.find((item) => item.kind === "journals")!;
    expect(check.status).toBe("invalid"); expect(check.records).toBeUndefined();
    expect(check.message).toContain("Поддерживаемых ключей с однозначной парой ID из каталогов архива: 1");
    expect(review.issues.some((issue) => issue.code.endsWith("-journal-area"))).toBe(false);
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "invalid-journal-document" }));
  });

  it("retains findings for hundreds of distinct lists without creating extra areas", async () => {
    const entries = Array.from({ length: 300 }, (_, index) => ({ key: `bi-university-journal-v1:subject-1:missing-${index}`, raw: "[]" }));
    const review = await inspectBackupJournals(entries, undefined, catalogs());
    expect(review.checks).toHaveLength(2); expect(review.checks[0]).toMatchObject({ documents: 300, records: 0, status: "valid" });
    expect(review.issues).toHaveLength(300); expect(review.issues.at(-1)?.referenceId).toBe(entries.at(-1)?.key);
    expect(review.issues.every((issue) => issue.code === "unresolved-journal-area")).toBe(true);
  });

  it("does not run area checks for unsupported key versions or claim verification without catalogs", async () => {
    const unsupported = await inspectBackupJournals([{ key: "bi-university-journal-v99:s:g", raw: "[]" }], undefined, catalogs());
    expect(unsupported.issues.map((issue) => issue.code)).toEqual(["unsupported-journal-key"]);
    const unchecked = await inspectBackupJournals([{ key: "bi-university-journal-v1:s:g", raw: "[]" }]);
    expect(unchecked.issues).toEqual([]); expect(unchecked.checks[0].message).toContain("Связь ключей с каталогами дисциплин и групп не проверялась");
  });

  it("propagates cancellation within a large catalog and before returning an empty result", async () => {
    const source = catalogs(Array.from({ length: 300 }, (_, index) => `subject-${index}`));
    const controller = new AbortController(); const pending = resolveJournalTeachingArea("missing:group-1", source, controller.signal); const timer = setTimeout(() => controller.abort(), 0);
    try { await expect(pending).rejects.toMatchObject({ name: "AbortError" }); } finally { clearTimeout(timer); }
    const aborted = new AbortController(); aborted.abort();
    await expect(resolveJournalTeachingArea("s:g", catalogs([], []), aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
