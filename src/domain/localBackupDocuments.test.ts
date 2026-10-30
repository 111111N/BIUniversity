import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";
import { backupFixture } from "../testSupport/localBackup";
import { BACKUP_CORE_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Archive checks must not access live storage"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("archived core document checks", () => {
  it("uses existing schemas and archived references without mutating raw documents or reading live storage", async () => {
    const state = coreBackupFixture(); const before = JSON.stringify(state.archive);
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.counts).toEqual({ valid: 4, invalid: 0, absent: 9, unchecked: 0, errors: 0, reviews: 0 });
    expect(result.checks.slice(0, 4).every((check) => check.status === "valid" && check.revision === 1)).toBe(true);
    expect(result.checks.slice(4).every((check) => check.status === "absent")).toBe(true);
    expect(forbidden).not.toHaveBeenCalled(); expect(JSON.stringify(state.archive)).toBe(before);
    expect(JSON.stringify(result)).not.toContain("Иван Петров"); expect(JSON.stringify(result)).not.toContain("Анна Смирнова");
  });
  it("does not infer demo documents, an empty successful account list or a usable login for absent sources", async () => {
    const result = await inspectBackupDocuments(backupFixture(), "configurator-demo");
    expect(result.counts).toMatchObject({ absent: 13, valid: 0, errors: 0, reviews: 1 });
    expect(result.checks.every((check) => check.status === "absent")).toBe(true);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "unchecked-access", level: "review" })); expect(forbidden).not.toHaveBeenCalled();
  });
  it.each(Object.keys(BACKUP_CORE_DOCUMENTS) as (keyof typeof BACKUP_CORE_DOCUMENTS)[])("rejects unsupported internal version of %s", async (kind) => {
    const state = coreBackupFixture(); const row = state.archive.localStorage.find((entry) => entry.key === BACKUP_CORE_DOCUMENTS[kind].key)!;
    row.raw = JSON.stringify({ ...JSON.parse(row.raw), version: 99 });
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.checks.find((check) => check.kind === kind)).toMatchObject({ status: "invalid", message: expect.stringContaining("Поддерживается только документ версии 1.") });
    expect(result.counts.invalid).toBe(1);
  });
  it("keeps malformed inner JSON as a finding without exposing SyntaxError snippets or aborting other document checks", async () => {
    const state = coreBackupFixture(); state.archive.localStorage[0].raw = '{"secret":"private-text" BROKEN';
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.counts).toMatchObject({ valid: 3, invalid: 1 }); expect(result.checks[0].message).toBe("Некорректный JSON внутри документа.");
    expect(JSON.stringify(result)).not.toContain("private-text");
  });
  it("does not silently skip a future storage key or substitute current accounts for it", async () => {
    const state = coreBackupFixture(); state.archive.localStorage[0].key = "bi-university-accounts-v2";
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.checks[0].status).toBe("absent"); expect(result.issues).toContainEqual(expect.objectContaining({ level: "error", code: "unsupported-key", referenceId: "bi-university-accounts-v2" }));
    expect(result.counts.unchecked).toBe(1);
  });
  it("reports record corruption through the existing decoders, including duplicates and inconsistent published journal", async () => {
    const state = coreBackupFixture(); state.accounts.accounts.push({ ...state.accounts.accounts[0] }); state.groups.groups[0].campus = 10;
    state.subjects.subjects.push({ ...state.subjects.subjects[0] }); state.schedule.published = state.schedule.drafts; state.schedule.drafts = []; state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.counts.invalid).toBe(4); expect(result.checks.slice(0, 4).every((check) => check.status === "invalid")).toBe(true); expect(result.counts.valid).toBe(0);
  });
  it("distinguishes the current configurator losing access from a schema that still has another active configurator", async () => {
    const state = coreBackupFixture(); state.accounts.accounts.push({ ...state.accounts.accounts[0], id: "another", login: "another" });
    state.accounts.accounts[0].status = "blocked"; state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.checks[0].status).toBe("valid"); expect(result.issues).toContainEqual(expect.objectContaining({ code: "actor-access", level: "error" }));
    state.accounts.accounts = state.accounts.accounts.filter((account) => account.id !== "configurator-demo"); state.save();
    expect((await inspectBackupDocuments(state.archive, "configurator-demo")).issues.some((issue) => issue.code === "actor-access")).toBe(true);
  });
  it("does not consider an archive without any active configurator readable", async () => {
    const state = coreBackupFixture(); state.accounts.accounts[0].status = "blocked"; state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.checks[0]).toMatchObject({ status: "invalid", message: "В хранилище отсутствует активный настройщик." });
  });
  it("reports missing membership and lesson targets once per ID", async () => {
    const state = coreBackupFixture(); state.accounts.accounts[1].memberships[0].subjectId = "missing-subject";
    state.accounts.accounts[2].studentGroupId = "missing-group"; state.accounts.accounts[2].memberships[0].groupIds = ["missing-group"];
    state.schedule.drafts[0].lessons[0].teacherId = "missing-teacher"; state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    for (const [code, referenceId] of [["missing-subject", "missing-subject"], ["missing-group", "missing-group"], ["missing-teacher", "missing-teacher"]]) expect(result.issues).toContainEqual(expect.objectContaining({ code, referenceId, level: "error" }));
    expect(result.issues.filter((issue) => issue.kind === "accounts" && issue.code === "missing-group")).toHaveLength(1);
  });
  it("marks links unverified rather than missing if their source is absent or unreadable", async () => {
    const state = coreBackupFixture(); state.archive.localStorage = state.archive.localStorage.filter((entry) => entry.key !== BACKUP_CORE_DOCUMENTS.groups.key);
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.issues.filter((issue) => issue.code === "unchecked-group")).toHaveLength(2);
    expect(result.issues.some((issue) => issue.code === "missing-group")).toBe(false);
  });
  it("uses explicit built-in group IDs conditionally and rejects a subject catalog the application cannot load", async () => {
    const state = coreBackupFixture(); state.groups.groups = []; state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo", { groupIds: ["group-1"], requiredSubjectIds: ["subject-1"] });
    expect(result.counts.errors).toBe(0); expect(result.issues).toContainEqual(expect.objectContaining({ code: "built-in-groups", level: "review" }));
    const incompatible = await inspectBackupDocuments(state.archive, "configurator-demo", { groupIds: ["group-1"], requiredSubjectIds: ["required-but-absent"] });
    expect(incompatible.checks.find((check) => check.kind === "subjects")?.status).toBe("invalid");
  });
  it("counts all unsupported documents as unreviewed instead of claiming full archive compatibility", async () => {
    const state = coreBackupFixture(); state.archive.localStorage.push({ key: "bi-university-unknown-module", raw: "[]" }, { key: "bi-university-theme", raw: "light" });
    const result = await inspectBackupDocuments(state.archive, "configurator-demo"); expect(result.counts.unchecked).toBe(1); expect(result.counts.valid).toBe(5);
  });
  it("retains every distinct finding beyond the old preview limit", async () => {
    const state = coreBackupFixture(); state.accounts.accounts[1].memberships = Array.from({ length: 205 }, (_, index) => ({ subjectId: `missing-${index}`, groupIds: ["group-1"] })); state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.issues).toHaveLength(205); expect(result.counts.errors).toBe(205);
    expect(result.issues.at(-1)).toMatchObject({ referenceId: "missing-204", code: "missing-subject" });
  });
  it("honours cancellation between document decoders", async () => {
    const controller = new AbortController(); const promise = inspectBackupDocuments(coreBackupFixture().archive, "configurator-demo", undefined, controller.signal); controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" }); expect(forbidden).not.toHaveBeenCalled();
  });
});
