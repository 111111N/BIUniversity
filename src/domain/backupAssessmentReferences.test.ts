import { afterEach, describe, expect, it, vi } from "vitest";
import { assessmentBackupFixture } from "../testSupport/assessmentBackup";
import { assessmentSupervisorFixture } from "../testSupport/assessmentSupervisors";
import { inspectSelectedAssessmentReferences, type AssessmentReferenceChoice } from "./backupAssessmentReferences";
import { reviewBackupAssessmentSelection } from "./backupAssessmentSelection";
import { BACKUP_LIMITS } from "./localBackup";
import type { BackupRecordEntries } from "./backupRecordComparison";
import type { AccountsDocument } from "./accounts";

const ACCOUNT_KEY = "bi-university-accounts-v1", GROUP_KEY = "bi-university-group-catalog-v1", SUBJECT_KEY = "bi-university-subject-catalog-v1";
const clone = (entries: BackupRecordEntries) => entries.map(entry => ({ ...entry }));
const editAccounts = (entries: BackupRecordEntries, edit: (state: AccountsDocument) => void) => {
  const next = clone(entries), entry = next.find(row => row.key === ACCOUNT_KEY)!;
  const state = JSON.parse(entry.raw) as AccountsDocument; edit(state); entry.raw = JSON.stringify(state); return next;
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("selected assessment reference presence", () => {
  it("checks exact IDs without live storage or private values in a successful result", async () => {
    const source = assessmentBackupFixture(), entries = source.archive.localStorage, before = JSON.stringify(entries);
    const forbidden = vi.fn(() => { throw new Error("Unexpected live storage access"); }); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden });
    const result = await inspectSelectedAssessmentReferences(source.document, entries, entries, []);
    expect(result).toEqual({ scope: "assessment-reference-presence", status: "references-present", counts: { references: 5, found: 5, missing: 0, unresolved: 0, unavailable: 0 }, issues: [] });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|teacher-1|student-1|graded|Смирнова/);
    expect(JSON.stringify(entries)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it.each(["archive", "browser"] as const)("keeps references that exist only in the %s source", async side => {
    const source = assessmentBackupFixture(), entries = source.archive.localStorage;
    expect(await inspectSelectedAssessmentReferences(source.document, side === "archive" ? entries : [], side === "browser" ? entries : [], [])).toMatchObject({ status: "references-present", counts: { found: 5 } });
  });
  it("distinguishes absent catalogs from missing IDs without using demo data", async () => {
    const source = assessmentBackupFixture();
    const result = await inspectSelectedAssessmentReferences(source.document, [], [], []);
    expect(result).toMatchObject({ status: "blocked", counts: { references: 5, found: 0, missing: 0, unavailable: 5 } });
    expect(result.issues.map(issue => [issue.code, issue.target])).toEqual([["missing-source", "accounts"], ["missing-source", "groups"], ["missing-source", "subjects"]]);
  });
  it("does not match an absent participant to another account with the same name", async () => {
    const source = assessmentBackupFixture();
    const entries = editAccounts(source.archive.localStorage, state => { state.accounts.find(row => row.id === "student-1")!.id = "another-student"; });
    const result = await inspectSelectedAssessmentReferences(source.document, entries, entries, []);
    expect(result).toMatchObject({ status: "blocked", counts: { missing: 1, found: 4 }, issues: [{ code: "missing-reference", target: "accounts", referenceId: "student-1" }] });
  });
  it.each([GROUP_KEY, SUBJECT_KEY])("does not match a renamed catalog ID by its saved name: %s", async key => {
    const source = assessmentBackupFixture(), entries = clone(source.archive.localStorage), entry = entries.find(row => row.key === key)!;
    const value = JSON.parse(entry.raw); const rows = key === GROUP_KEY ? value.groups : value.subjects; rows[0].id = "different-id"; entry.raw = JSON.stringify(value);
    const result = await inspectSelectedAssessmentReferences(source.document, entries, entries, []);
    expect(result).toMatchObject({ status: "blocked", counts: { missing: 1, unavailable: 0 } });
    expect(result.issues[0].referenceId).toBe(key === GROUP_KEY ? "group-1" : "subject-1");
  });
  it.each(["damaged", "duplicate", "unsupported", "invalid-history"])("does not fall back to the valid browser when the archive source is %s", async mode => {
    const source = assessmentBackupFixture(), archive = clone(source.archive.localStorage), entry = archive.find(row => row.key === ACCOUNT_KEY)!;
    if (mode === "damaged") entry.raw = "PRIVATE DAMAGED JSON";
    if (mode === "duplicate") archive.push({ ...entry });
    if (mode === "unsupported") archive.push({ key: "bi-university-accounts-v99", raw: entry.raw });
    if (mode === "invalid-history") { const value = JSON.parse(entry.raw); value.history = [null]; entry.raw = JSON.stringify(value); }
    const result = await inspectSelectedAssessmentReferences(source.document, archive, source.archive.localStorage, []);
    expect(result).toMatchObject({ status: "blocked", counts: { unavailable: 3, found: 2 }, issues: [{ code: "invalid-source", target: "accounts" }] });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("requires manual review of a referenced card with different values", async () => {
    const source = assessmentBackupFixture(), archive = source.archive.localStorage;
    const browser = editAccounts(archive, state => { state.accounts.find(row => row.id === "teacher-1")!.name = "PRIVATE OTHER NAME"; });
    expect(await inspectSelectedAssessmentReferences(source.document, archive, browser, [])).toMatchObject({ status: "blocked", counts: { unresolved: 1, found: 4 }, issues: [{ code: "unresolved-reference", referenceId: "teacher-1" }] });
    for (const version of ["archive", "browser"] as const) {
      expect(await inspectSelectedAssessmentReferences(source.document, archive, browser, [{ collection: "accounts", id: "teacher-1", version }])).toMatchObject({ status: "references-present", counts: { found: 5 } });
    }
  });
  it("compares semantic fields independently of object property order", async () => {
    const source = assessmentBackupFixture(), browser = source.archive.localStorage.map(entry => ({ key: entry.key, raw: JSON.stringify(JSON.parse(entry.raw), (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value) }));
    expect(await inspectSelectedAssessmentReferences(source.document, source.archive.localStorage, browser, [])).toMatchObject({ status: "references-present", counts: { unresolved: 0 } });
  });
  it("does not require choices for unrelated cards or treat their current state as historical authority", async () => {
    const source = assessmentBackupFixture(), archive = source.archive.localStorage;
    const browser = editAccounts(archive, state => { state.accounts.find(row => row.id === "chair")!.name = "PRIVATE UNRELATED NAME"; });
    expect(await inspectSelectedAssessmentReferences(source.document, archive, browser, [])).toMatchObject({ status: "references-present" });
    const historical = editAccounts(archive, state => { const teacher = state.accounts.find(row => row.id === "teacher-1")!; teacher.role = "configurator"; teacher.memberships = []; teacher.status = "blocked"; const student = state.accounts.find(row => row.id === "student-1")!; student.status = "blocked"; });
    expect(await inspectSelectedAssessmentReferences(source.document, historical, historical, [])).toMatchObject({ status: "references-present" });
  });
  it("finds missing historical commission members even though the latest result is already published", async () => {
    const source = assessmentBackupFixture("exam", true), entries = editAccounts(source.archive.localStorage, state => { state.accounts = state.accounts.filter(row => row.id !== "member" && row.id !== "chair"); });
    const result = await inspectSelectedAssessmentReferences(source.document, entries, entries, []);
    expect(result).toMatchObject({ status: "blocked", counts: { missing: 2 } });
    expect(result.issues.map(issue => issue.referenceId).sort()).toEqual(["chair", "member"]);
  });
  it("checks previous supervisors from assignment history after replacement", async () => {
    const fixture = assessmentSupervisorFixture(), document = fixture.change();
    const entries = editAccounts(fixture.source.save(document).localStorage, state => { state.accounts = state.accounts.filter(row => row.id !== "teacher-1"); });
    expect(await inspectSelectedAssessmentReferences(document, entries, entries, [])).toMatchObject({ status: "blocked", issues: [{ referenceId: "teacher-1", code: "missing-reference" }] });
  });
  it.each(["same", "one-sided", "duplicate", "invalid-side"])("rejects a stale or invalid choice: %s", async mode => {
    const source = assessmentBackupFixture(), archive = source.archive.localStorage, choices: AssessmentReferenceChoice[] = [{ collection: "accounts", id: "teacher-1", version: "archive" }];
    if (mode === "duplicate") choices.push(choices[0]);
    if (mode === "invalid-side") (choices[0] as { version: string }).version = "newest";
    const result = await inspectSelectedAssessmentReferences(source.document, archive, mode === "one-sided" ? [] : archive, choices);
    expect(result).toMatchObject({ status: "blocked", issues: [{ code: "invalid-choice" }] });
  });
  it("supports empty selected assessments without requiring unrelated catalogs", async () => {
    const source = assessmentBackupFixture(), document = { ...source.document, assessments: [], history: [], revision: 0 };
    expect(await inspectSelectedAssessmentReferences(document, [], [], [])).toMatchObject({ status: "references-present", counts: { references: 0 } });
  });
  it("does not require a subject catalog when the assessment has no subject ID", async () => {
    const source = assessmentBackupFixture(), document = structuredClone(source.document); document.assessments[0].subjectId = null;
    const entries = source.archive.localStorage.filter(entry => entry.key !== SUBJECT_KEY);
    expect(await inspectSelectedAssessmentReferences(document, entries, entries, [])).toMatchObject({ status: "references-present", counts: { references: 4, found: 4 } });
  });
  it("blocks a structurally consistent selected document when its required references are missing", async () => {
    const source = assessmentBackupFixture(), entries = source.archive.localStorage.filter(entry => entry.key !== ACCOUNT_KEY);
    const result = await reviewBackupAssessmentSelection(entries, entries, [], undefined, { choices: [] });
    expect(result).toMatchObject({ status: "blocked", records: { assessments: 1 }, references: { status: "blocked", counts: { unavailable: 3 } }, issues: [{ code: "unresolved-references" }] });
  });
  it("honors cancellation and source budgets without certifying a partial set", async () => {
    const source = assessmentBackupFixture(), controller = new AbortController(); controller.abort();
    await expect(inspectSelectedAssessmentReferences(source.document, [], [], [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    const previous = BACKUP_LIMITS.records; BACKUP_LIMITS.records = 0;
    try { expect(await inspectSelectedAssessmentReferences(source.document, source.archive.localStorage, [], [])).toMatchObject({ status: "blocked", counts: { found: 0, unavailable: 5 } }); }
    finally { BACKUP_LIMITS.records = previous; }
  });
});
