import { decodeAccountsDocument, isUserRole } from "./accounts";
import { BACKUP_LIMITS, checkBackupAbort } from "./localBackup";
import type { BackupRecordEntries } from "./backupRecordComparison";
import type { BackupRecordPreview } from "./backupRecordPreview";

export const BACKUP_VISUAL_PREFERENCE_KEYS = { theme: "bi-university-theme", plannerView: "bi-university-planner-view", scheduleView: "bi-university-schedule-view" } as const;
const ACCOUNT_DOCUMENT_KEY = "bi-university-accounts-v1";
const theme = { label: "Тема интерфейса", values: { dark: "Тёмная тема (dark)", light: "Светлая тема (light)" } };
const planner = { label: "Вид планировщика", values: { board: "Неделя (board)", list: "Список (list)" } };
const schedule = { label: "Вид расписания", values: { grid: "Сетка (grid)", list: "Список (list)" } };

// The account ID is literal: colons and percent text after the role remain part of it.
export const getBackupSchedulePreferenceOwner = (key: string) => {
  const prefix = `${BACKUP_VISUAL_PREFERENCE_KEYS.scheduleView}:`;
  if (!key.startsWith(prefix)) return undefined;
  const suffix = key.slice(prefix.length), separator = suffix.indexOf(":");
  if (separator <= 0) return undefined;
  const role = suffix.slice(0, separator), id = suffix.slice(separator + 1);
  return isUserRole(role) && id.trim() ? { role, id } : undefined;
};
const definitionFor = (key: string): { label: string; values: Readonly<Record<string, string>> } | undefined => {
  if (key === BACKUP_VISUAL_PREFERENCE_KEYS.theme) return theme;
  if (key === BACKUP_VISUAL_PREFERENCE_KEYS.plannerView) return planner;
  if (getBackupSchedulePreferenceOwner(key)) return schedule;
  return undefined;
};
export const isBackupVisualPreferenceKey = (key: string) => definitionFor(key) !== undefined;
export const isSupportedBackupVisualPreferenceValue = (key: string, raw: string) => {
  const definition = definitionFor(key);
  return definition !== undefined && Object.hasOwn(definition.values, raw);
};

export async function readBackupVisualPreferencePreview(archive: BackupRecordEntries, browser: BackupRecordEntries, key: string, signal?: AbortSignal): Promise<BackupRecordPreview> {
  checkBackupAbort(signal);
  const definition = definitionFor(key);
  if (!definition) throw new Error("Просмотр этой настройки не поддерживается.");
  const read = async (entries: BackupRecordEntries, target: string) => {
    if (entries.length > BACKUP_LIMITS.records) throw new Error("Источник превышает лимит 25 000 локальных записей. Сравнение настройки остановлено.");
    let value: string | undefined;
    for (let i = 0; i < entries.length; i++) {
      if (i % 128 === 0) { await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); }
      const entry = entries[i]; if (entry.key !== target) continue;
      if (value !== undefined || (entry.key.length + entry.raw.length) * 2 > BACKUP_LIMITS.textBytes) throw new Error("Источник настройки неоднозначен или превышает лимит. Проверьте архив заново.");
      value = entry.raw;
    }
    if (value === undefined) throw new Error(target === ACCOUNT_DOCUMENT_KEY
      ? "В одном из источников отсутствует документ учётных записей. Владелец настройки расписания не подтверждён."
      : "Одна из версий настройки отсутствует. Конфликт не подтверждён; проверьте архив заново.");
    return value;
  };
  const before = await read(archive, key), after = await read(browser, key);
  if (!isSupportedBackupVisualPreferenceValue(key, before) || !isSupportedBackupVisualPreferenceValue(key, after)) throw new Error("Значение настройки не входит в поддерживаемый набор. Значения не показаны; выбор версии недоступен.");
  if (before === after) throw new Error("Конфликт настройки больше не подтверждён. Проверьте архив заново.");
  const owner = getBackupSchedulePreferenceOwner(key);
  if (owner) {
    for (const entries of [archive, browser]) {
      const raw = await read(entries, ACCOUNT_DOCUMENT_KEY);
      let confirmed = false;
      try { confirmed = decodeAccountsDocument(raw).accounts.some(account => account.id === owner.id); }
      catch { /* Invalid documents cannot establish ownership; no live/default accounts are used. */ }
      if (!confirmed) throw new Error("Владелец настройки расписания не подтверждён в одном из источников. Значения не показаны; проверьте документы учётных записей.");
      checkBackupAbort(signal);
    }
  }
  const preview: BackupRecordPreview = {
    reference: { storage: "localStorage", key }, collectionLabel: "Настройки интерфейса",
    rows: [{ field: "value", label: definition.label, archive: definition.values[before], browser: definition.values[after] }], hasUnpreviewedFields: false,
  };
  if (JSON.stringify(preview).length * 2 > 128 * 1024) throw new Error("Адрес настройки слишком велик для просмотра. Частичный результат не показан.");
  checkBackupAbort(signal);
  return preview;
}
