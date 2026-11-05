import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertCompleteCatalogComparison, compareBackupCatalogRecords } from "./backupCatalogComparison";
import { getBackupDifferenceKey } from "./backupComparison";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";

const GROUP_KEY = "bi-university-group-catalog-v1", SUBJECT_KEY = "bi-university-subject-catalog-v1";
const state = () => {
  const fixture = coreBackupFixture();
  return { groups: fixture.groups, subjects: fixture.subjects,
    entries: () => [{ key: GROUP_KEY, raw: JSON.stringify(fixture.groups) }, { key: SUBJECT_KEY, raw: JSON.stringify(fixture.subjects) }] };
};
const forbidden = vi.fn(() => { throw new Error("No live access during domain comparison"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("read-only catalog entity comparison", () => {
  it("matches stored cards without consulting live data or losing source values", async () => {
    const fixture = state(); const archive = fixture.entries(), browser = [...fixture.entries()].reverse();
    const before = JSON.stringify([archive, browser]); const review = await compareBackupCatalogRecords(archive, browser);
    for (const part of [review.groups, review.subjects]) expect(part.counts).toEqual({ documents: 1, comparedDocuments: 1, uncheckedDocuments: 0, same: 1, new: 0, different: 0, currentOnly: 0 });
    expect(() => assertCompleteCatalogComparison(review)).not.toThrow();
    expect(JSON.stringify([archive, browser])).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("compares all group fields and subject fields without exporting their values", async () => {
    const fixture = state(); const archive = fixture.entries();
    Object.assign(fixture.groups.groups[0], { name: "PRIVATE GROUP", course: 2, campus: 2, admissionYear: 2025, status: "archived", previousNames: ["PRIVATE OLD"], revision: 2, createdAt: "2026-01-01T00:00Z", createdBy: "PRIVATE ACTOR", updatedAt: "2026-11-05T00:00Z", source: "initial" });
    Object.assign(fixture.subjects.subjects[0], { name: "PRIVATE SUBJECT", shortName: "PRIVATE", semester: "PRIVATE SEMESTER", color: "purple" });
    const review = await compareBackupCatalogRecords(archive, fixture.entries());
    expect(review.groups.differences[0].fields).toEqual(["name", "course", "campus", "admissionYear", "status", "previousNames", "revision", "createdAt", "createdBy", "updatedAt", "source"]);
    expect(review.subjects.differences[0].fields).toEqual(["name", "shortName", "semester", "color"]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(() => assertCompleteCatalogComparison(review)).not.toThrow();
  });
  it("does not match names or share IDs across group and subject collections", async () => {
    const fixture = state(); fixture.subjects.subjects[0].id = fixture.groups.groups[0].id;
    const review = await compareBackupCatalogRecords(fixture.entries(), []);
    expect(review.groups.counts.new).toBe(1); expect(review.subjects.counts.new).toBe(1);
    expect(new Set([...review.groups.differences, ...review.subjects.differences].map(getBackupDifferenceKey)).size).toBe(2);
    const original = fixture.entries(); fixture.groups.groups[0].id = "new-group-id";
    const renamed = await compareBackupCatalogRecords(original, fixture.entries());
    expect(renamed.groups.counts).toMatchObject({ same: 0, new: 1, currentOnly: 1 });
  });
  it("retains missing optional fields and compares unknown fields without disclosing names", async () => {
    const fixture = state(); const original = fixture.entries();
    Object.assign(fixture.groups.groups[0], { status: "active", PRIVATE_EXTENSION: { value: "PRIVATE" } });
    const review = await compareBackupCatalogRecords(original, fixture.entries());
    expect(review.groups.differences[0].fields).toEqual(["status", "other"]); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it("leaves history, document revision and unknown envelope fields to the existing whole-document comparison", async () => {
    const fixture = state(); const original = fixture.entries();
    fixture.groups.revision++; fixture.subjects.revision++;
    fixture.groups.history.push({ id: "change-1", groupId: "group-1", actorId: "PRIVATE", occurredAt: "2026-11-05T00:00Z", action: "created" });
    fixture.subjects.history.push({ id: "change-2", subjectId: "subject-1", actorId: "PRIVATE", occurredAt: "2026-11-05T00:00Z", action: "created" });
    Object.assign(fixture.groups, { PRIVATE_ENVELOPE: "PRIVATE" });
    const review = await compareBackupCatalogRecords(original, fixture.entries());
    expect(review.groups.counts.same).toBe(1); expect(review.subjects.counts.same).toBe(1);
    expect(review.groups.differences).toEqual([]); expect(review.subjects.differences).toEqual([]);
    expect(original[0].raw).not.toBe(fixture.entries()[0].raw);
  });
  it.each(["groups", "subjects"] as const)("rejects an entire damaged or duplicate-ID %s document", async (kind) => {
    const fixture = state(); const original = fixture.entries();
    if (kind === "groups") fixture.groups.groups.push({ ...fixture.groups.groups[0] });
    else fixture.subjects.subjects.push({ ...fixture.subjects.subjects[0] });
    const review = await compareBackupCatalogRecords(original, fixture.entries());
    expect(review[kind].counts).toMatchObject({ comparedDocuments: 0, uncheckedDocuments: 1, new: 0, currentOnly: 0 });
    expect(review[kind].differences).toEqual([]); expect(review[kind].uncompared[0]).toMatchObject({ source: "browser", reason: "invalid-document" });
  });
  it("does not salvage valid cards from a document with damaged history", async () => {
    const fixture = state(); const original = fixture.entries();
    Object.assign(fixture.groups, { history: [{ id: "broken", groupId: "absent" }] });
    const review = await compareBackupCatalogRecords(original, fixture.entries());
    expect(review.groups.counts.uncheckedDocuments).toBe(1); expect(review.groups.differences).toEqual([]);
  });
  it("does not merge future document keys with the current catalog", async () => {
    const fixture = state(); const entries = fixture.entries();
    const future = { ...entries[0], key: "bi-university-group-catalog-v2" };
    const review = await compareBackupCatalogRecords([future], [entries[0]]);
    expect(review.groups.counts).toMatchObject({ documents: 2, comparedDocuments: 1, uncheckedDocuments: 1, currentOnly: 1, same: 0 });
    expect(review.groups.uncompared).toEqual([{ key: future.key, source: "archive", reason: "unsupported-key" }]);
  });
  it("blocks repeated document keys and keeps absent sources separate from saved empty catalogs", async () => {
    const fixture = state(); const group = fixture.entries()[0];
    const review = await compareBackupCatalogRecords([group, group], []);
    expect(review.groups.uncompared[0].reason).toBe("duplicate-key"); expect(review.groups.differences).toEqual([]);
    fixture.groups.groups = [];
    expect((await compareBackupCatalogRecords(fixture.entries(), [])).groups.counts.comparedDocuments).toBe(1);
    expect((await compareBackupCatalogRecords([], [])).groups.counts.documents).toBe(0);
  });
  it("retains every changed card after 200 and rejects an incomplete cross-collection report", async () => {
    const fixture = state(); const subject = fixture.subjects.subjects[0];
    fixture.subjects.subjects = Array.from({ length: 230 }, (_, index) => ({ ...subject, id: `subject-${String(index).padStart(3, "0")}`, name: `Дисциплина ${index}`, shortName: `S${index}` }));
    const original = fixture.entries(); fixture.subjects.subjects = fixture.subjects.subjects.map((row) => ({ ...row, color: "purple" }));
    const review = await compareBackupCatalogRecords(original, fixture.entries());
    expect(review.subjects.counts.different).toBe(230); expect(review.subjects.differences.at(-1)?.id).toBe("subject-229");
    expect(() => assertCompleteCatalogComparison(review)).not.toThrow();
    const wrong = structuredClone(review); wrong.groups = structuredClone(review.subjects) as typeof wrong.groups;
    expect(() => assertCompleteCatalogComparison(wrong)).toThrow("неполный отчёт");
    review.subjects.differences.pop(); expect(() => assertCompleteCatalogComparison(review)).toThrow("неполный отчёт");
  });
  it("does not normalize stored spelling when validating a catalog", async () => {
    const fixture = state(); const original = fixture.entries(); fixture.groups.groups[0].name = ` ${fixture.groups.groups[0].name} `;
    const review = await compareBackupCatalogRecords(original, fixture.entries());
    expect(review.groups.differences[0].fields).toEqual(["name"]);
  });
  it("supports cancellation before reading and between long card comparisons", async () => {
    const fixture = state(); const aborted = new AbortController(); aborted.abort();
    await expect(compareBackupCatalogRecords(fixture.entries(), [], aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
    fixture.subjects.subjects = Array.from({ length: 300 }, (_, index) => ({ ...fixture.subjects.subjects[0], id: `subject-${index}`, name: `Дисциплина ${index}`, shortName: `S${index}` }));
    const pending = new AbortController(); setTimeout(() => pending.abort(), 0);
    await expect(compareBackupCatalogRecords(fixture.entries(), [], pending.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(forbidden).not.toHaveBeenCalled();
  });
});
