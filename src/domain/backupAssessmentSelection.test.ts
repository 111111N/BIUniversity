import { afterEach, describe, expect, it, vi } from "vitest";
import { assessmentBackupFixture } from "../testSupport/assessmentBackup";
import { assessmentCorrectionFixture } from "../testSupport/assessmentCorrections";
import { reviewBackupAssessmentSelection, type AssessmentRecordChoice } from "./backupAssessmentSelection";
import { compareBackupAssessmentRecords } from "./backupAssessmentComparison";
import { ASSESSMENTS_STORAGE_KEY, type AssessmentDocument } from "./assessmentTypes";
import { decodeAssessmentDocument, emptyAssessmentDocument } from "./assessments";
import { BACKUP_LIMITS } from "./localBackup";

const entries = (value: AssessmentDocument) => [{ key: ASSESSMENTS_STORAGE_KEY, raw: JSON.stringify(value) }];
const allChoices = async (a: AssessmentDocument, b: AssessmentDocument, version: "archive" | "browser"): Promise<AssessmentRecordChoice[]> => {
  const compared = await compareBackupAssessmentRecords(entries(a), entries(b));
  return ([ ["assessments", compared.assessments], ["history", compared.history], ["corrections", compared.corrections!], ["correctionHistory", compared.correctionHistory!] ] as const)
    .flatMap(([collection, review]) => review.differences.filter(row => row.kind === "different").map(row => ({ collection, id: row.id, version })));
};
const changedGrades = () => {
  const a = assessmentBackupFixture().document, b = structuredClone(a);
  for (const row of b.assessments[0].attempts[0].results) row.outcome = { status: "graded", grade: 2 };
  for (const event of b.history) for (const row of event.results ?? []) row.outcome = { status: "graded", grade: 2 };
  decodeAssessmentDocument(JSON.stringify(b));
  return { a, b };
};
const independent = (suffix: string) => {
  const state = assessmentBackupFixture().document;
  state.assessments[0].id += suffix;
  state.assessments[0].attempts[0].id += suffix;
  for (const event of state.history) { event.id += suffix; event.assessmentId += suffix; event.attemptId += suffix; }
  decodeAssessmentDocument(JSON.stringify(state)); return state;
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("selected assessment document preflight", () => {
  it("validates matching documents without storage reads, writes or private values in its result", async () => {
    const blocked = vi.fn(() => { throw new Error("Unexpected live storage access"); });
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
    const state = assessmentBackupFixture().document, a = entries(state), b = entries(state), before = JSON.stringify([a, b]);
    const result = await reviewBackupAssessmentSelection(a, b, []);
    expect(result).toMatchObject({ scope: "assessment-document", status: "consistent", counts: { same: 4, conflicts: 0 }, revisions: { archive: 3, browser: 3, candidate: 3 }, records: { assessments: 1, history: 3, corrections: 0, correctionHistory: 0 } });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|student-1|teacher-1|assessment-0|graded/);
    expect(blocked).not.toHaveBeenCalled(); expect(JSON.stringify([a, b])).toBe(before);
  });
  it("compares semantic values independently of object property order", async () => {
    const state = assessmentBackupFixture().document, reordered = JSON.parse(JSON.stringify(state, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value));
    expect(await reviewBackupAssessmentSelection(entries(state), entries(reordered), [])).toMatchObject({ status: "consistent", counts: { conflicts: 0 } });
  });
  it.each(["archive", "browser"] as const)("requires manual choices even when %s has the same revision and supports a complete coherent branch", async version => {
    const { a, b } = changedGrades();
    expect(await reviewBackupAssessmentSelection(entries(a), entries(b), [])).toMatchObject({ status: "blocked", counts: { conflicts: 3, unresolved: 3 }, issues: [{ code: "unresolved-conflicts" }] });
    const choices = await allChoices(a, b, version);
    expect(await reviewBackupAssessmentSelection(entries(a), entries(b), choices)).toMatchObject({ status: "consistent", revisions: { candidate: 3 }, counts: { unresolved: 0 } });
  });
  it("blocks a result card selected from one source with incompatible history from the other", async () => {
    const { a, b } = changedGrades(), choices = await allChoices(a, b, "archive");
    choices.find(choice => choice.collection === "assessments")!.version = "browser";
    const result = await reviewBackupAssessmentSelection(entries(a), entries(b), choices);
    expect(result).toMatchObject({ status: "blocked", issues: [{ code: "inconsistent-selection" }] }); expect(result.revisions.candidate).toBeUndefined();
  });
  it("preserves browser-only and archive-only assessments and both histories without selecting the larger revision", async () => {
    const a = independent("-archive"), b = independent("-browser");
    const result = await reviewBackupAssessmentSelection(entries(a), entries(b), []);
    expect(result).toMatchObject({ status: "consistent", counts: { archiveOnly: 4, browserOnly: 4 }, records: { assessments: 2, history: 6 }, revisions: { archive: 3, browser: 3, candidate: 6 } });
  });
  it("treats an absent document as absent and preserves existing data", async () => {
    const state = assessmentBackupFixture().document;
    expect(await reviewBackupAssessmentSelection([], entries(state), [])).toMatchObject({ status: "consistent", counts: { browserOnly: 4 }, revisions: { archive: null, browser: 3, candidate: 3 } });
    expect(await reviewBackupAssessmentSelection(entries(state), [], [])).toMatchObject({ status: "consistent", counts: { archiveOnly: 4 }, revisions: { browser: null, candidate: 3 } });
    expect(await reviewBackupAssessmentSelection([], [], [])).toMatchObject({ status: "consistent", records: { assessments: 0, history: 0 }, revisions: { candidate: 0 } });
  });
  it.each(["broken", "duplicate", "future-key", "invalid-revision"])("blocks %s without discarding it as an empty document", async mode => {
    const state = assessmentBackupFixture().document, source = entries(state);
    if (mode === "broken") source[0].raw = "PRIVATE BROKEN JSON";
    if (mode === "duplicate") source.push(source[0]);
    if (mode === "future-key") source.push({ key: "bi-university-assessments-v99", raw: "{}" });
    if (mode === "invalid-revision") source[0].raw = JSON.stringify({ ...state, revision: 999 });
    const result = await reviewBackupAssessmentSelection(source, entries(state), []);
    expect(result).toMatchObject({ status: "blocked", issues: [{ code: "invalid-source" }] }); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it.each(["unknown", "duplicate", "same", "invalid-side"])("rejects a %s choice instead of applying a fallback", async mode => {
    const { a, b } = changedGrades(), choices = await allChoices(a, b, "archive");
    if (mode === "unknown") choices.push({ ...choices[0], id: "missing" });
    if (mode === "duplicate") choices.push(choices[0]);
    if (mode === "same") choices.push({ collection: "history", id: a.history[0].id, version: "browser" });
    if (mode === "invalid-side") (choices[0] as { version: string }).version = "latest";
    expect(await reviewBackupAssessmentSelection(entries(a), entries(b), choices)).toMatchObject({ status: "blocked", issues: [{ code: "invalid-choice" }] });
  });
  it("preserves new correction versions and audits while the original publication remains unchanged", async () => {
    const fixture = assessmentCorrectionFixture(), a = fixture.initial, b = fixture.publish(fixture.save(fixture.open()));
    expect(await reviewBackupAssessmentSelection(entries(a), entries(b), [])).toMatchObject({ status: "consistent", records: { corrections: 1, correctionHistory: 3 }, revisions: { archive: 3, browser: 6, candidate: 6 } });
  });
  it("blocks mixing a corrected grade with the other branch's publication audit", async () => {
    const fixture = assessmentCorrectionFixture(), opened = fixture.open();
    const a = fixture.publish(fixture.save(opened, { status: "graded", grade: 2 })), b = fixture.publish(fixture.save(opened, { status: "graded", grade: 4 }));
    const choices = await allChoices(a, b, "archive"); choices.find(choice => choice.collection === "corrections")!.version = "browser";
    expect(await reviewBackupAssessmentSelection(entries(a), entries(b), choices)).toMatchObject({ status: "blocked", issues: [{ code: "inconsistent-selection" }] });
    expect(await reviewBackupAssessmentSelection(entries(a), entries(b), await allChoices(a, b, "browser"))).toMatchObject({ status: "consistent", revisions: { candidate: 6 } });
  });
  it("allows different interleaving of independent assessments with the same event times", async () => {
    const first = independent("-a"), second = independent("-b"), a = { ...emptyAssessmentDocument(), revision: 6, assessments: [...first.assessments, ...second.assessments], history: [...first.history, ...second.history] }, b = { ...a, history: [...second.history, ...first.history] };
    decodeAssessmentDocument(JSON.stringify(a)); decodeAssessmentDocument(JSON.stringify(b));
    expect(await reviewBackupAssessmentSelection(entries(a), entries(b), [])).toMatchObject({ status: "consistent", records: { assessments: 2, history: 6 } });
  });
  it("does not guess the order of contradictory equal-time audit events of the same assessment", async () => {
    const a = assessmentBackupFixture().document;
    a.history.splice(2, 0, { ...structuredClone(a.history[1]), id: "another-save" }); a.revision++;
    const b = structuredClone(a); [b.history[1], b.history[2]] = [b.history[2], b.history[1]];
    decodeAssessmentDocument(JSON.stringify(a)); decodeAssessmentDocument(JSON.stringify(b));
    expect(await reviewBackupAssessmentSelection(entries(a), entries(b), [])).toMatchObject({ status: "blocked", issues: [{ code: "inconsistent-selection" }] });
  });
  it("reads legacy versions without silently equating inferred and recorded assignment history", async () => {
    const state = assessmentBackupFixture().document;
    const legacy = { version: 2, revision: state.revision, assessments: state.assessments, history: state.history.map(({ assignment: _assignment, ...event }) => event) };
    const result = await reviewBackupAssessmentSelection([{ key: ASSESSMENTS_STORAGE_KEY, raw: JSON.stringify(legacy) }], entries(state), []);
    expect(result).toMatchObject({ status: "blocked", counts: { conflicts: 1, unresolved: 1 } });
  });
  it("honors cancellation and bounded work without returning partial results", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(reviewBackupAssessmentSelection([], [], [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    const previous = BACKUP_LIMITS.records; BACKUP_LIMITS.records = 0;
    try { await expect(reviewBackupAssessmentSelection(entries(assessmentBackupFixture().document), [], [])).rejects.toThrow("25 000"); }
    finally { BACKUP_LIMITS.records = previous; }
  });
});
