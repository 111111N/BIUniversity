import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertCompletePlannerComparison, compareBackupPlannerRecords } from "./backupPlannerComparison";
import { getBackupDifferenceKey } from "./backupComparison";
import { getPlannerStorageKey, LEGACY_PLANNER_OWNER_ID, PLANNER_STORAGE_KEY } from "./plannerStorage";
import { BACKUP_LIMITS } from "./localBackup";

const task = (id = "task-1") => ({ id, title: "PRIVATE TITLE", text: "PRIVATE TEXT", createdAt: "2026-11-02T00:00:00.000Z", startAt: "2026-11-02T09:00:00.000Z", endAt: "2026-11-02T10:00:00.000Z", completed: false, priority: "medium", category: "study" });
const entry = (rows: unknown[], owner = "student-1") => ({ key: getPlannerStorageKey(owner), raw: JSON.stringify(rows) });
const forbidden = vi.fn(() => { throw new Error("No live access from the comparison domain"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("read-only planner entity comparison", () => {
  it("matches exact IDs despite document order, object property order or JSON formatting", async () => {
    const first = task(), second = task("second");
    const archive = [entry([first, second])], current = [entry([Object.fromEntries(Object.entries(second).reverse()), first])];
    const before = JSON.stringify([archive, current]); const review = await compareBackupPlannerRecords(archive, current);
    expect(review.counts).toEqual({ documents: 1, comparedDocuments: 1, uncheckedDocuments: 0, same: 2, new: 0, different: 0, currentOnly: 0 });
    expect(review.differences).toEqual([]); expect(review.uncompared).toEqual([]); expect(() => assertCompletePlannerComparison(review)).not.toThrow();
    expect(JSON.stringify([archive, current])).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("reports changed field names without values, choosing a winner or modifying either snapshot", async () => {
    const original = task(); const latest = { ...original, title: "PRIVATE NEW", text: "PRIVATE NEW TEXT", createdAt: "2026-11-03T00:00Z", startAt: "2026-11-03T09:00Z", endAt: "2026-11-03T10:00Z", completed: true, category: "personal", priority: "high" };
    const review = await compareBackupPlannerRecords([entry([original])], [entry([latest])]);
    expect(review.counts.different).toBe(1);
    expect(review.differences).toEqual([{ kind: "different", area: `Планировщик · ${getPlannerStorageKey("student-1")}`, id: original.id, reference: { storage: "localStorage-record", key: getPlannerStorageKey("student-1"), collection: "planner", id: original.id }, fields: ["title", "text", "createdAt", "startAt", "endAt", "completed", "priority", "category"] }]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(review).not.toHaveProperty("selectedVersion");
  });
  it("counts archive-only and browser-only tasks separately without deleting or generating IDs", async () => {
    const review = await compareBackupPlannerRecords([entry([task("archive-only"), task()])], [entry([task("browser-only"), task()])]);
    expect(review.counts).toMatchObject({ same: 1, new: 1, currentOnly: 1, different: 0 });
    expect(review.differences.map(({ kind, id, fields }) => ({ kind, id, fields }))).toEqual([{ kind: "new", id: "archive-only", fields: [] }, { kind: "current-only", id: "browser-only", fields: [] }]);
  });
  it("does not match the same task ID across different private owner scopes", async () => {
    const review = await compareBackupPlannerRecords([entry([task()], "first")], [entry([task()], "second")]);
    expect(review.counts).toMatchObject({ documents: 2, same: 0, new: 1, currentOnly: 1 });
    expect(new Set(review.differences.map(getBackupDifferenceKey)).size).toBe(2);
  });
  it("keeps legacy optional fields omitted instead of normalizing them to the browser's defaults", async () => {
    const legacy = { id: "old", title: "PRIVATE", createdAt: "2026-11-02T00:00Z" };
    const review = await compareBackupPlannerRecords([entry([legacy])], [entry([{ ...legacy, text: "", completed: false }])]);
    expect(review.differences[0].fields).toEqual(["text", "completed"]);
  });
  it("reports unknown metadata as other fields without exposing property names or values", async () => {
    const review = await compareBackupPlannerRecords([entry([{ ...task(), PRIVATE_FIELD: { secret: "PRIVATE" } }])], [entry([task()])]);
    expect(review.differences[0].fields).toEqual(["other"]); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it.each(["archive", "browser"] as const)("does not treat an invalid %s list as empty or salvage a subset", async (source) => {
    const invalid = { key: getPlannerStorageKey("student-1"), raw: JSON.stringify([task(), null]) };
    const valid = entry([task("unrelated")]);
    const review = await compareBackupPlannerRecords([source === "archive" ? invalid : valid], [source === "browser" ? invalid : valid]);
    expect(review.counts).toMatchObject({ documents: 1, comparedDocuments: 0, uncheckedDocuments: 1, new: 0, currentOnly: 0 });
    expect(review.differences).toEqual([]); expect(review.uncompared).toEqual([{ key: invalid.key, source, reason: "invalid-document" }]);
  });
  it("rejects ambiguous record IDs and repeated document keys without selecting a version", async () => {
    const duplicate = entry([task(), task()]);
    expect((await compareBackupPlannerRecords([duplicate], [])).uncompared[0].reason).toBe("invalid-document");
    const document = entry([task()]); const review = await compareBackupPlannerRecords([document, document], []);
    expect(review.uncompared[0].reason).toBe("duplicate-key"); expect(review.differences).toEqual([]);
  });
  it("supports the canonical legacy teacher key but does not merge its noncanonical alias", async () => {
    const alias = `${PLANNER_STORAGE_KEY}:${LEGACY_PLANNER_OWNER_ID}`;
    const review = await compareBackupPlannerRecords([entry([task()], LEGACY_PLANNER_OWNER_ID)], [{ key: alias, raw: JSON.stringify([task()]) }]);
    expect(review.counts).toMatchObject({ documents: 2, comparedDocuments: 1, uncheckedDocuments: 1, same: 0, new: 1 });
    expect(review.uncompared).toEqual([{ key: alias, source: "browser", reason: "unsupported-key" }]);
  });
  it("distinguishes no saved lists, empty lists, and an unreadable list", async () => {
    expect((await compareBackupPlannerRecords([], [])).counts.documents).toBe(0);
    expect((await compareBackupPlannerRecords([entry([])], [])).counts).toMatchObject({ documents: 1, comparedDocuments: 1, same: 0 });
    expect((await compareBackupPlannerRecords([{ key: getPlannerStorageKey("student-1"), raw: "PRIVATE{broken" }], [])).uncompared[0].reason).toBe("invalid-document");
  });
  it("retains all differences after 200 and validates a complete report", async () => {
    const rows = Array.from({ length: 230 }, (_, index) => task(`task-${String(index).padStart(3, "0")}`));
    const review = await compareBackupPlannerRecords([entry(rows)], [entry(rows.map((row) => ({ ...row, completed: true })))]);
    expect(review.counts.different).toBe(230); expect(review.differences.at(-1)?.id).toBe("task-229");
    expect(() => assertCompletePlannerComparison(review)).not.toThrow(); review.differences.pop();
    expect(() => assertCompletePlannerComparison(review)).toThrow("отсутствует часть записей");
  });
  it("rejects truncated and contradictory uncompared-document inventories", async () => {
    const review = await compareBackupPlannerRecords([{ ...entry([]), raw: "broken" }], []);
    expect(() => assertCompletePlannerComparison(review)).not.toThrow(); review.uncompared = [];
    expect(() => assertCompletePlannerComparison(review)).toThrow("неполный отчёт");
  });
  it("honours cancellation before and during a long comparison without writes", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(compareBackupPlannerRecords([entry([task()])], [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    const pending = new AbortController(); setTimeout(() => pending.abort(), 0);
    await expect(compareBackupPlannerRecords([entry(Array.from({ length: 300 }, (_, index) => task(`task-${index}`)))], [], pending.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("enforces a text bound before parsing and a record bound without a partial result", async () => {
    await expect(compareBackupPlannerRecords([{ ...entry([]), raw: "x".repeat(BACKUP_LIMITS.textBytes / 2 + 1) }], [])).rejects.toThrow("16 МиБ");
    const rows = Array.from({ length: BACKUP_LIMITS.records + 1 }, (_, index) => ({ id: `task-${index}`, title: "", createdAt: "2026-11-02T00:00Z" }));
    await expect(compareBackupPlannerRecords([entry(rows)], [])).rejects.toThrow("25 000");
  });
  it("bounds the result size when a long owner key repeats in many record addresses", async () => {
    const rows = Array.from({ length: 8 }, (_, index) => task(`task-${index}`));
    await expect(compareBackupPlannerRecords([entry(rows, `owner-${"x".repeat(1_000_000)}`)], [])).rejects.toThrow("Результат сравнения задач превышает лимит");
  });
});
