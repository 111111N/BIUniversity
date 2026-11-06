import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canPreviewBackupDifference, readBackupRecordPreview } from "./backupRecordPreview";
import { getBackupSchedulePreferenceOwner, isSupportedBackupVisualPreferenceValue } from "./backupVisualPreferences";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";
import type { BackupDifference } from "./backupComparison";
import { BACKUP_LIMITS } from "./localBackup";

const themeKey = "bi-university-theme", plannerKey = "bi-university-planner-view", scheduleKey = "bi-university-schedule-view:student:student-1";
const difference = (key: string): BackupDifference => ({ kind: "different", area: "Локальные данные", id: key, reference: { storage: "localStorage", key } });
const sources = (key = themeKey, archive = "dark", browser = "light") => ({ archive: [{ key, raw: archive }], browser: [{ key, raw: browser }] });
const forbidden = vi.fn(() => { throw new Error("No live/default data or changes during preview"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); vi.stubGlobal("window", { dispatchEvent: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("supported visual preference conflicts", () => {
  it.each([
    [themeKey, "dark", "light", "Тема интерфейса", "Тёмная тема (dark)", "Светлая тема (light)"],
    [plannerKey, "board", "list", "Вид планировщика", "Неделя (board)", "Список (list)"],
  ])("previews %s as a complete scalar without changing UI or reading defaults", async (key, a, b, label, av, bv) => {
    const state = sources(key, a, b), before = JSON.stringify(state);
    const preview = await readBackupRecordPreview(state.archive, state.browser, difference(key));
    expect(preview).toEqual({ reference: { storage: "localStorage", key }, collectionLabel: "Настройки интерфейса", rows: [{ field: "value", label, archive: av, browser: bv }], hasUnpreviewedFields: false });
    expect(JSON.stringify(state)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("checks the literal owner separately in each source without requiring the historical role to stay current", async () => {
    const fixture = coreBackupFixture(), archive = [{ key: scheduleKey, raw: "grid" }, ...fixture.archive.localStorage];
    fixture.accounts.accounts[2].role = "teacher"; fixture.accounts.accounts[2].status = "blocked"; fixture.save();
    const browser = [{ key: scheduleKey, raw: "list" }, ...fixture.archive.localStorage];
    const preview = await readBackupRecordPreview(archive, browser, difference(scheduleKey));
    expect(preview.rows[0]).toMatchObject({ label: "Вид расписания", archive: "Сетка (grid)", browser: "Список (list)" }); expect(forbidden).not.toHaveBeenCalled();
  });
  it.each(["archive", "browser"] as const)("does not borrow owner proof from the other source: %s", async source => {
    const fixture = coreBackupFixture(), state = sources(scheduleKey, "grid", "list");
    state.archive.push(...fixture.archive.localStorage); state.browser.push(...fixture.archive.localStorage);
    state[source] = state[source].filter(entry => entry.key !== "bi-university-accounts-v1");
    await expect(readBackupRecordPreview(state.archive, state.browser, difference(scheduleKey))).rejects.toThrow("отсутствует"); expect(forbidden).not.toHaveBeenCalled();
  });
  it.each(["invalid", "missing-owner", "duplicate-account-source"])("rejects unconfirmed ownership without revealing unrelated account fields: %s", async mode => {
    const fixture = coreBackupFixture(), state = sources(scheduleKey, "grid", "list");
    state.archive.push(...fixture.archive.localStorage);
    fixture.accounts.accounts[2].id = "different-student"; fixture.accounts.accounts[2].name = "PRIVATE NAME"; fixture.save();
    state.browser.push(...fixture.archive.localStorage);
    const account = state.browser.find(entry => entry.key === "bi-university-accounts-v1")!;
    if (mode === "invalid") account.raw = "PRIVATE BROKEN JSON";
    if (mode === "duplicate-account-source") state.browser.push({ ...account });
    await expect(readBackupRecordPreview(state.archive, state.browser, difference(scheduleKey))).rejects.toThrow(mode === "duplicate-account-source" ? "неоднозначен" : "не подтверждён");
  });
  it("does not URI-decode or split a literal owner ID after the first role separator", async () => {
    const fixture = coreBackupFixture(), id = "student/a:b%20", key = `bi-university-schedule-view:student:${id}`;
    fixture.accounts.accounts[2].id = id; fixture.save();
    expect(getBackupSchedulePreferenceOwner(key)).toEqual({ role: "student", id });
    const archive = [{ key, raw: "grid" }, ...fixture.archive.localStorage], browser = [{ key, raw: "list" }, ...fixture.archive.localStorage];
    await expect(readBackupRecordPreview(archive, browser, difference(key))).resolves.toHaveProperty("rows");
    const encoded = key.replace(id, encodeURIComponent(id));
    await expect(readBackupRecordPreview([{ key: encoded, raw: "grid" }, ...fixture.archive.localStorage], [{ key: encoded, raw: "list" }, ...fixture.archive.localStorage], difference(encoded))).rejects.toThrow("не подтверждён");
  });
  it.each(["PRIVATE<script>payload</script>", '"dark"', " dark ", "", "toString", "__proto__"])("rejects unsupported scalar content without exposing it: %s", async raw => {
    const state = sources(themeKey, raw);
    expect(isSupportedBackupVisualPreferenceValue(themeKey, raw)).toBe(false);
    await expect(readBackupRecordPreview(state.archive, state.browser, difference(themeKey))).rejects.toThrow("не входит в поддерживаемый набор");
  });
  it.each(["bi-university-theme-v2", "bi-university-planner-view-extra", "bi-university-demo-account", "bi-university-demo-role", "bi-university-accounts-v1", "bi-university-schedule-view:admin:student-1", "bi-university-schedule-view:student:"])("does not enable arbitrary document or login-setting previews: %s", async key => {
    expect(canPreviewBackupDifference(difference(key))).toBe(false);
    await expect(readBackupRecordPreview([{ key, raw: "PRIVATE" }], [{ key, raw: "PRIVATE OTHER" }], difference(key))).rejects.toThrow("недоступен");
  });
  it("requires an exact difference ID, conflict kind, both sources and changed values", async () => {
    const state = sources();
    expect(canPreviewBackupDifference({ ...difference(themeKey), id: "another-key" })).toBe(false);
    expect(canPreviewBackupDifference({ ...difference(themeKey), kind: "new" })).toBe(false);
    await expect(readBackupRecordPreview([], state.browser, difference(themeKey))).rejects.toThrow("отсутствует");
    await expect(readBackupRecordPreview(state.archive, [], difference(themeKey))).rejects.toThrow("отсутствует");
    await expect(readBackupRecordPreview(state.archive, state.archive, difference(themeKey))).rejects.toThrow("не подтверждён");
    await expect(readBackupRecordPreview([...state.archive, ...state.archive], state.browser, difference(themeKey))).rejects.toThrow("неоднозначен");
  });
  it("does not return oversized sources or partial previews", async () => {
    await expect(readBackupRecordPreview([{ key: themeKey, raw: "x".repeat(BACKUP_LIMITS.textBytes / 2) }], [{ key: themeKey, raw: "light" }], difference(themeKey))).rejects.toThrow("превышает лимит");
    const archive = Array.from({ length: BACKUP_LIMITS.records + 1 }, () => ({ key: "bi-university-unrelated", raw: "PRIVATE" }));
    await expect(readBackupRecordPreview(archive, [{ key: themeKey, raw: "light" }], difference(themeKey))).rejects.toThrow("25 000");
  });
  it("honours cancellation during an asynchronously scanned source", async () => {
    const controller = new AbortController(), state = sources();
    const pending = readBackupRecordPreview(state.archive, state.browser, difference(themeKey), controller.signal); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" }); expect(forbidden).not.toHaveBeenCalled();
  });
});
