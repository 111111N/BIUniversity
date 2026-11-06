import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBackupMaterialAreaComparison } from "./backupMaterialAreaComparison";
import { assertBackupMaterialAreaComparison } from "./backupMaterialArea";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";
import { BACKUP_LIMITS, type BackupValue } from "./localBackup";

const material = (scope?: string): BackupValue => ({ type: "object", entries: scope === undefined ? [] : [["scope", { type: "string", value: scope }]] });
const forbidden = vi.fn(() => { throw new Error("No live catalogs, ownership inference or writes"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("material areas against independent source catalogs", () => {
  it.each([["user:teacher-1", "user"], ["subject:subject-1", "subject"], ["group:subject-1:group-1", "group"]] as const)("matches a declared %s without exposing its IDs", async (scope, kind) => {
    const fixture = coreBackupFixture(), before = JSON.stringify(fixture.archive), service = await createBackupMaterialAreaComparison(fixture.archive.localStorage, fixture.archive.localStorage);
    const result = await service.compare(material(scope), material(scope));
    expect(result).toEqual({ version: 1, archive: { status: "matched", kind }, browser: { status: "matched", kind }, relation: "same" });
    expect(() => assertBackupMaterialAreaComparison(result)).not.toThrow(); expect(JSON.stringify(result)).not.toMatch(/teacher-1|subject-1|group-1/); expect(JSON.stringify(fixture.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("detects changed user IDs and distinguishes user and subject namespaces", async () => {
    const fixture = coreBackupFixture(), service = await createBackupMaterialAreaComparison(fixture.archive.localStorage, fixture.archive.localStorage);
    expect(await service.compare(material("user:teacher-1"), material("user:student-1"))).toMatchObject({ relation: "different" });
    expect(await service.compare(material("user:teacher-1"), material("subject:subject-1"))).toMatchObject({ relation: "different", browser: { kind: "subject" } });
  });
  it.each(["archive", "browser"] as const)("does not borrow account evidence from the other side: %s", async side => {
    const fixture = coreBackupFixture(), sources = { archive: structuredClone(fixture.archive.localStorage), browser: structuredClone(fixture.archive.localStorage) };
    sources[side] = sources[side].filter(entry => entry.key !== "bi-university-accounts-v1");
    const service = await createBackupMaterialAreaComparison(sources.archive, sources.browser), result = await service.compare(material("user:teacher-1"), material("user:teacher-1"));
    expect(result[side]).toEqual({ status: "unavailable-catalog", kind: "user" }); expect(result.relation).toBe("unresolved");
  });
  it.each(["invalid", "duplicate", "missing-id"])("rejects an unconfirmed declared person in its own catalog: %s", async mode => {
    const fixture = coreBackupFixture(), archive = structuredClone(fixture.archive.localStorage); let browser = structuredClone(archive);
    const entry = browser.find(row => row.key === "bi-university-accounts-v1")!;
    if (mode === "invalid") entry.raw = "PRIVATE BAD JSON";
    if (mode === "duplicate") browser.push({ ...entry });
    if (mode === "missing-id") { fixture.accounts.accounts.splice(1, 1); fixture.save(); browser = fixture.archive.localStorage; }
    const service = await createBackupMaterialAreaComparison(archive, browser), result = await service.compare(material("user:teacher-1"), material("user:teacher-1"));
    expect(result.browser).toEqual({ status: mode === "missing-id" ? "unresolved-reference" : "unavailable-catalog", kind: "user" }); expect(result.relation).toBe("unresolved"); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("requires canonical user scopes and preserves literal subject IDs", async () => {
    const fixture = coreBackupFixture(), id = "person/a:b%20";
    fixture.accounts.accounts[1].id = id; fixture.subjects.subjects[0].id = "subject/a:b%20"; fixture.save();
    const service = await createBackupMaterialAreaComparison(fixture.archive.localStorage, fixture.archive.localStorage);
    const user = `user:${encodeURIComponent(id)}`;
    expect(await service.compare(material(user), material(user))).toMatchObject({ relation: "same" });
    expect(await service.compare(material("user:person/a:b%20"), material(user))).toMatchObject({ archive: { status: "unsupported-scope" }, relation: "unresolved" });
    expect(await service.compare(material("subject:subject/a:b%20"), material("subject:subject/a:b%20"))).toMatchObject({ relation: "same" });
    expect(await service.compare(material(`subject:${encodeURIComponent("subject/a:b%20")}`), material("subject:subject/a:b%20"))).toMatchObject({ archive: { status: "unresolved-reference", kind: "subject" }, relation: "unresolved" });
  });
  it("keeps legacy scopes unassigned and does not infer a person from the uploader name", async () => {
    const fixture = coreBackupFixture(), service = await createBackupMaterialAreaComparison(fixture.archive.localStorage, fixture.archive.localStorage);
    for (const scope of [undefined, "", "cabinet"]) {
      const value = material(scope); if (value.type === "object") value.entries.push(["uploadedBy", { type: "string", value: fixture.accounts.accounts[1].name }]);
      expect(await service.compare(value, value)).toMatchObject({ archive: { status: "legacy" }, browser: { status: "legacy" }, relation: "unresolved" });
    }
    expect(await service.compare(material("user:absent-person"), material("user:teacher-1"))).toMatchObject({ archive: { status: "unresolved-reference" }, relation: "unresolved" });
  });
  it("does not select one split when a group scope matches several archived pairs", async () => {
    const fixture = coreBackupFixture();
    fixture.subjects.subjects[0].id = "a"; fixture.subjects.subjects.push({ ...fixture.subjects.subjects[0], id: "a:b", name: "Другая дисциплина", shortName: "ДР" });
    fixture.groups.groups[0].id = "b:c"; fixture.groups.groups.push({ ...fixture.groups.groups[0], id: "c", name: "Другая группа" }); fixture.save();
    const service = await createBackupMaterialAreaComparison(fixture.archive.localStorage, fixture.archive.localStorage), result = await service.compare(material("group:a:b:c"), material("group:a:b:c"));
    expect(result).toMatchObject({ archive: { status: "ambiguous-area", kind: "group" }, browser: { status: "ambiguous-area" }, relation: "unresolved" });
  });
  it("detects different resolved pairs even when the saved group scope is identical", async () => {
    const a = coreBackupFixture(), b = coreBackupFixture();
    a.subjects.subjects[0].id = "a"; a.groups.groups[0].id = "b:c"; a.save();
    b.subjects.subjects[0].id = "a:b"; b.groups.groups[0].id = "c"; b.save();
    const service = await createBackupMaterialAreaComparison(a.archive.localStorage, b.archive.localStorage);
    expect(await service.compare(material("group:a:b:c"), material("group:a:b:c"))).toEqual({ version: 1, archive: { status: "matched", kind: "group" }, browser: { status: "matched", kind: "group" }, relation: "different" });
  });
  it("keeps unavailable group/subject catalogs distinct from missing IDs", async () => {
    const fixture = coreBackupFixture(), entries = fixture.archive.localStorage.filter(row => row.key !== "bi-university-subject-catalog-v1");
    const service = await createBackupMaterialAreaComparison(entries, fixture.archive.localStorage);
    expect(await service.compare(material("subject:subject-1"), material("subject:absent"))).toMatchObject({ archive: { status: "unavailable-catalog", kind: "subject" }, browser: { status: "unresolved-reference", kind: "subject" } });
    expect(await service.compare(material("group:subject-1:group-1"), material("group:subject-1:absent"))).toMatchObject({ archive: { status: "unavailable-catalog", kind: "group" }, browser: { status: "unresolved-reference", kind: "group" } });
  });
  it("does not let a bad record or unsupported store establish an area", async () => {
    const fixture = coreBackupFixture(), service = await createBackupMaterialAreaComparison(fixture.archive.localStorage, fixture.archive.localStorage);
    expect(await service.compare(material("user:teacher-1"), material("user:teacher-1"), ["browser"])).toMatchObject({ browser: { status: "unavailable-record" }, relation: "unresolved" });
    expect(await service.compare({ type: "object", entries: [["scope", { type: "number", value: 1 }]] }, material("user:teacher-1"))).toMatchObject({ archive: { status: "unavailable-record" } });
  });
  it("does not expose mutable cached summaries to callers", async () => {
    const fixture = coreBackupFixture(), service = await createBackupMaterialAreaComparison(fixture.archive.localStorage, fixture.archive.localStorage), value = material("user:teacher-1");
    const result = await service.compare(value, value); Object.assign(result.archive, { status: "legacy" });
    expect(await service.compare(value, value)).toMatchObject({ archive: { status: "matched", kind: "user" }, relation: "same" });
  });
  it("rejects oversized catalogs and honours cancellation during comparison", async () => {
    await expect(createBackupMaterialAreaComparison([{ key: "bi-university-accounts-v1", raw: "x".repeat(BACKUP_LIMITS.textBytes / 2) }], [])).rejects.toThrow("16 МиБ");
    const fixture = coreBackupFixture(), controller = new AbortController();
    const service = await createBackupMaterialAreaComparison(fixture.archive.localStorage, fixture.archive.localStorage, controller.signal); controller.abort();
    await expect(service.compare(material("user:teacher-1"), material("user:teacher-1"))).rejects.toMatchObject({ name: "AbortError" });
  });
});
