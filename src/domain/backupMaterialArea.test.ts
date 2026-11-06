import { describe, expect, it } from "vitest";
import { assertBackupMaterialAreaComparison, type BackupMaterialAreaComparison } from "./backupMaterialArea";
import { assertBackupFileDifferenceDetails } from "./backupFileDifference";
import type { BackupDifference } from "./backupComparison";

const area = (): BackupMaterialAreaComparison => ({ version: 1, archive: { status: "matched", kind: "user" }, browser: { status: "matched", kind: "user" }, relation: "same" });
describe("material-area report contract", () => {
  it.each(["extra-identity", "source-identity", "missing-kind", "unknown-kind", "false-relation", "mixed-kinds", "ambiguous-kind"])("rejects leaking or inconsistent summaries: %s", mode => {
    const result = area();
    if (mode === "extra-identity") Object.assign(result, { identity: "PRIVATE PERSON" });
    if (mode === "source-identity") Object.assign(result.archive, { identity: "PRIVATE PERSON" });
    if (mode === "missing-kind") Object.assign(result, { archive: { status: "matched" } });
    if (mode === "unknown-kind") Object.assign(result.archive, { kind: "PRIVATE VALUE" });
    if (mode === "false-relation") Object.assign(result, { archive: { status: "legacy" } });
    if (mode === "mixed-kinds") Object.assign(result.browser, { kind: "subject" });
    if (mode === "ambiguous-kind") Object.assign(result, { relation: "unresolved", archive: { status: "ambiguous-area", kind: "user" } });
    expect(() => assertBackupMaterialAreaComparison(result)).toThrow("неполный отчёт");
  });
  it("keeps the material-only annotation out of learning-file records", () => {
    const difference: BackupDifference = { kind: "different", area: "Учебные файлы", id: "file-1", reference: { storage: "indexedDB", database: "bi-university-learning-files", store: "files", key: { type: "string", value: "file-1" } }, fileDifference: { version: 1, status: "compared", fields: ["content"], issues: [], ownership: "unverified", materialArea: area() } };
    expect(() => assertBackupFileDifferenceDetails(difference)).toThrow("неполный отчёт");
  });
  it("does not accept a matched area from an unreadable material record", () => {
    const difference: BackupDifference = { kind: "different", area: "Материалы", id: "file-1", reference: { storage: "indexedDB", database: "bi-university-cabinet", store: "teacher-files", key: { type: "string", value: "file-1" } }, fileDifference: { version: 1, status: "uncompared", fields: [], issues: [{ source: "browser", reason: "invalid-record" }], ownership: "unverified", materialArea: area() } };
    expect(() => assertBackupFileDifferenceDetails(difference)).toThrow("неполный отчёт");
    difference.fileDifference!.materialArea = { ...area(), browser: { status: "unavailable-record" }, relation: "unresolved" };
    expect(() => assertBackupFileDifferenceDetails(difference)).not.toThrow();
  });
});
