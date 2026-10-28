import { describe, expect, it, vi } from "vitest";
import { BACKUP_LIMITS, createBackupBudget, encodeBackupValue, isPortalStorageKey } from "./localBackup";

describe("lossless local backup values", () => {
  it("preserves binary bytes and File identity metadata, including empty files", async () => {
    const file = new File([new Uint8Array([0, 128, 255, 10])], "ответ.pdf", { type: "application/pdf", lastModified: 123 });
    const budget = createBackupBudget();
    expect(await encodeBackupValue(file, budget)).toEqual({ type: "blob", size: 4, mediaType: "application/pdf", base64: "AID/Cg==", file: { name: "ответ.pdf", lastModified: 123 } });
    expect(await encodeBackupValue(new Blob([]), budget)).toEqual({ type: "blob", size: 0, mediaType: "", base64: "" });
    expect(budget).toMatchObject({ binaryBytes: 4, files: 2 });
  });
  it("preserves owners, undefined, dates, arrays and reserved object keys without prototype mutation", async () => {
    const source = JSON.parse('{"__proto__":{"owner":"x"},"scope":"user:teacher"}') as Record<string, unknown>;
    source.optional = undefined; source.date = new Date("2026-10-28T10:00:00Z"); source.values = [false, null, 0, ""];
    const encoded = await encodeBackupValue(source, createBackupBudget());
    expect(encoded).toMatchObject({ type: "object", entries: [
      ["__proto__", { type: "object", entries: [["owner", { type: "string", value: "x" }]] }],
      ["scope", { type: "string", value: "user:teacher" }], ["optional", { type: "undefined" }],
      ["date", { type: "date", value: "2026-10-28T10:00:00.000Z" }],
      ["values", { type: "array", value: [{ type: "boolean", value: false }, { type: "null" }, { type: "number", value: 0 }, { type: "string", value: "" }] }],
    ] });
    expect(Object.prototype).not.toHaveProperty("owner");
  });
  it.each([NaN, Infinity, new Map(), new Set(), new Date("invalid"), 1n])("rejects unsupported values instead of silently dropping %s", async (value) => {
    await expect(encodeBackupValue(value, createBackupBudget())).rejects.toThrow("неподдерживаемый");
  });
  it("rejects excess binary size before reading the next file", async () => {
    const blob = new Blob(["x"]); const read = vi.spyOn(blob, "arrayBuffer");
    const budget = { ...createBackupBudget(), binaryBytes: BACKUP_LIMITS.binaryBytes };
    await expect(encodeBackupValue(blob, budget)).rejects.toThrow("64 МиБ"); expect(read).not.toHaveBeenCalled();
  });
  it("rejects excessive text, depth and cyclic structures", async () => {
    await expect(encodeBackupValue("x", { ...createBackupBudget(), textBytes: BACKUP_LIMITS.textBytes })).rejects.toThrow("16 МиБ");
    const cyclic: unknown[] = []; cyclic.push(cyclic);
    await expect(encodeBackupValue(cyclic, createBackupBudget())).rejects.toThrow("Структура");
  });
  it("supports cancellation without reading a Blob", async () => {
    const controller = new AbortController(); controller.abort();
    const blob = new Blob(["x"]); const read = vi.spyOn(blob, "arrayBuffer");
    await expect(encodeBackupValue(blob, createBackupBudget(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(read).not.toHaveBeenCalled();
  });
  it("only selects portal-owned persistent keys, including future portal versions", () => {
    expect(isPortalStorageKey("bi-university-messages-v99")).toBe(true);
    for (const key of ["other-app-token", "bi-university", "not-bi-university-data"]) expect(isPortalStorageKey(key)).toBe(false);
  });
});
