import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectBackupSettings, isBackupSettingKey } from "./backupSettingsDocuments";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { settingsBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Inspection must not read live accounts, change settings or select users"); });
const accounts = [{ id: "student-1", role: "student" as const }, { id: "configurator-demo", role: "configurator" as const }];
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); vi.stubGlobal("window", { localStorage: { getItem: forbidden, setItem: forbidden } }); });
afterEach(() => vi.unstubAllGlobals());

describe("archived scalar browser preferences", () => {
  it("checks known plain strings and archived account links without applying or rewriting them", async () => {
    const state = settingsBackupFixture(); const before = JSON.stringify(state.archive);
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts).toEqual({ valid: 11, invalid: 0, absent: 2, unchecked: 0, errors: 0, reviews: 0 });
    expect(review.checks).toContainEqual(expect.objectContaining({ kind: "settings", status: "valid", keys: 6 }));
    expect(JSON.stringify(state.archive)).toBe(before); expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(forbidden).not.toHaveBeenCalled();
  });

  it.each([
    ["bi-university-theme", "dark"], ["bi-university-theme", "light"],
    ["bi-university-demo-role", "student"], ["bi-university-demo-role", "teacher"], ["bi-university-demo-role", "configurator"],
    ["bi-university-planner-view", "board"], ["bi-university-planner-view", "list"],
    ["bi-university-schedule-view:student:student-1", "grid"], ["bi-university-schedule-view:student:student-1", "list"],
  ])("accepts the current literal value for %s: %s", async (key, raw) => {
    const review = await inspectBackupSettings([{ key, raw }], accounts);
    expect(review.checks[0].status).toBe("valid"); expect(review.issues.some((issue) => issue.level === "error")).toBe(false);
  });

  it.each([
    ["bi-university-theme", "PRIVATE unknown theme"], ["bi-university-theme", '"light"'], ["bi-university-theme", " light "],
    ["bi-university-demo-role", "PRIVATE admin"], ["bi-university-planner-view", "week"],
    ["bi-university-schedule-view:student:student-1", "board"], ["bi-university-demo-account", ""],
  ])("reports invalid %s without choosing a fallback: %s", async (key, raw) => {
    const entry = { key, raw }; const review = await inspectBackupSettings([entry], accounts);
    expect(review.checks[0].status).toBe("invalid");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "invalid-setting-value", referenceId: key }));
    expect(entry.raw).toBe(raw); expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(forbidden).not.toHaveBeenCalled();
  });

  it("distinguishes unreadable archived accounts from a definitely missing selected account", async () => {
    const entries = [{ key: "bi-university-demo-account", raw: "student-1" }];
    expect((await inspectBackupSettings(entries)).issues).toContainEqual(expect.objectContaining({ code: "unchecked-setting-account", level: "review" }));
    expect((await inspectBackupSettings(entries, [])).issues).toContainEqual(expect.objectContaining({ code: "missing-setting-account", level: "error" }));
  });

  it("uses literal schedule owner IDs, preserving colons, slashes and percent text without URI decoding", async () => {
    const id = "student/a:b%20"; const key = `bi-university-schedule-view:student:${id}`;
    const review = await inspectBackupSettings([{ key, raw: "grid" }], [{ id, role: "student" }]);
    expect(review.issues).toEqual([]);
    const encodedKey = `bi-university-schedule-view:student:${encodeURIComponent(id)}`;
    expect((await inspectBackupSettings([{ key: encodedKey, raw: "grid" }], [{ id, role: "student" }])).issues).toContainEqual(expect.objectContaining({ code: "missing-setting-account" }));
  });

  it("does not discard historical view preferences when an owner changes role or loses active access", async () => {
    const review = await inspectBackupSettings([{ key: "bi-university-schedule-view:student:student-1", raw: "list" }], [{ id: "student-1", role: "teacher", status: "blocked" }]);
    expect(review.issues).toEqual([]);
  });

  it("marks a mismatched role and blocked selected account for review without changing the selection", async () => {
    const entries = [{ key: "bi-university-demo-account", raw: "student-1" }, { key: "bi-university-demo-role", raw: "student" }];
    const before = JSON.stringify(entries);
    const review = await inspectBackupSettings(entries, [{ id: "student-1", role: "teacher", status: "blocked" }]);
    for (const code of ["selected-role-mismatch", "blocked-selected-account"]) expect(review.issues).toContainEqual(expect.objectContaining({ code, level: "review" }));
    expect(review.checks[0].status).toBe("valid"); expect(JSON.stringify(entries)).toBe(before);
  });

  it("does not resolve a legacy selection by role into an assumed demo account", async () => {
    const review = await inspectBackupSettings([{ key: "bi-university-demo-role", raw: "teacher" }], accounts);
    expect(review.issues).toEqual([expect.objectContaining({ code: "legacy-role-selection", level: "review" })]);
    expect(JSON.stringify(review)).not.toContain("teacher-elena-volkova");
  });

  it("does not trim selected IDs into another account", async () => {
    const review = await inspectBackupSettings([{ key: "bi-university-demo-account", raw: " student-1 " }], accounts);
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "missing-setting-account" }));
  });

  it.each(["bi-university-theme-v2", "bi-university-demo-account-extra", "bi-university-schedule-view", "bi-university-schedule-view:admin:user", "bi-university-schedule-view:student:"])("does not reinterpret unsupported key %s", async (key) => {
    const review = await inspectBackupSettings([{ key, raw: "list" }], accounts);
    expect(review.checks[0].status).toBe("invalid"); expect(review.issues).toContainEqual(expect.objectContaining({ code: "unsupported-setting-key", referenceId: key }));
  });

  it("groups hundreds of preference keys while keeping each bad key addressable", async () => {
    const entries = Array.from({ length: 250 }, (_, index) => ({ key: `bi-university-schedule-view:student:owner-${index}`, raw: "list" }));
    const owners = entries.map((_, index) => ({ id: `owner-${index}`, role: "student" as const }));
    entries[200].raw = "PRIVATE VALUE";
    const review = await inspectBackupSettings(entries, owners);
    expect(review.checks).toHaveLength(1); expect(review.checks[0]).toMatchObject({ keys: 250, status: "invalid" });
    expect(review.checks[0].message).toContain("прочитано: 249; не читается: 1");
    expect(review.issues).toContainEqual(expect.objectContaining({ referenceId: entries[200].key }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("keeps absent settings distinct from explicit defaults and ignores unrelated data", async () => {
    const review = await inspectBackupSettings([{ key: "bi-university-demo-planner", raw: "[]" }, { key: "bi-university-demo-notifications", raw: "[]" }]);
    expect(review.checks[0]).toMatchObject({ keys: 0, status: "absent" }); expect(review.issues).toEqual([]);
    expect(isBackupSettingKey("bi-university-accounts-v1")).toBe(false);
  });

  it("honours cancellation between batches without returning a partial review", async () => {
    const entries = Array.from({ length: 260 }, (_, index) => ({ key: `bi-university-schedule-view:student:owner-${index}`, raw: "list" }));
    const controller = new AbortController(); const promise = inspectBackupSettings(entries, undefined, controller.signal); controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
