import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { administrationChecksService } from "./administrationChecksService";
import { accountService } from "./accountStore";
import { refreshAcademicCatalog, SUBJECT_CATALOG_STORAGE_KEY } from "./academicCatalog";
import type { AdministrationChecksQuery } from "../domain/administrationChecks";
import { createChecksReturn, readChecksReturn, withChecksReturn } from "../domain/administrationChecksNavigation";

let values: Map<string, string>;
let writes: number;
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const query = { q: "Анна", kind: "student-number", level: "action", page: 9 };
beforeEach(() => {
  values = new Map(); writes = 0;
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes++; values.set(key, value); } });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
  refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const returnQuery = (back: string): AdministrationChecksQuery => {
  const params = new URL(back, "https://portal.invalid").searchParams;
  return { q: params.get("q") ?? "", kind: params.get("kind") ?? "all", level: params.get("level") ?? "all", page: Number(params.get("page") ?? 1) };
};

describe("data check correction and return", () => {
  it("reads fresh results with the same filters after a real correction, without an extra write on return", async () => {
    const original = await administrationChecksService.list({ ...actor, query });
    expect(original.page).toBe(1); expect(original.total).toBe(1);
    const back = createChecksReturn(new URLSearchParams({ ...query, page: String(query.page) }).toString(), original.page, original.rows[0].id);
    const target = new URL(withChecksReturn("/admin/accounts?account=anna-smirnova&mode=education", back), "https://portal.invalid");
    expect(readChecksReturn(target.pathname, target.search)).toBe(back); expect(writes).toBe(0);
    const number = await accountService.previewStudentNumber({ ...actor, campus: 1 });
    await accountService.issueStudentRecord({ ...actor, expectedRevision: 0, accountId: "anna-smirnova", accountRevision: 1, campus: 1, expectedStudentNumber: number.number });
    const afterCorrection = [...values]; expect(writes).toBe(1);
    vi.setSystemTime(new Date("2026-10-28T10:05:00Z"));
    const restored = await administrationChecksService.list({ ...actor, query: returnQuery(back) });
    expect(returnQuery(back)).toMatchObject({ q: "Анна", kind: "student-number", level: "action", page: 1 });
    expect(restored.total).toBe(0); expect(restored.checkedAt).toBe("2026-10-28T10:05:00.000Z");
    expect(restored.versions.accounts).toBe(1); expect(writes).toBe(1); expect([...values]).toEqual(afterCorrection);
  });

  it("keeps the error policy when a source becomes unreadable during corrective editing", async () => {
    const original = await administrationChecksService.list({ ...actor, query });
    const back = createChecksReturn("?q=Анна&kind=student-number&level=action", original.page, original.rows[0].id);
    values.set(SUBJECT_CATALOG_STORAGE_KEY, "unreadable catalog");
    await expect(administrationChecksService.list({ ...actor, query: returnQuery(back) })).rejects.toThrow();
    expect(values.get(SUBJECT_CATALOG_STORAGE_KEY)).toBe("unreadable catalog"); expect(writes).toBe(0);
  });
});
