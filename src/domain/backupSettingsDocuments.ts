import { isUserRole, type CurrentUser } from "./accounts";
import { checkBackupAbort, type AdministrativeBackup } from "./localBackup";
import type { BackupDocumentCheck, BackupDocumentIssue } from "./localBackupDocuments";

const THEME = "bi-university-theme";
const ACCOUNT = "bi-university-demo-account";
const ROLE = "bi-university-demo-role";
const PLANNER_VIEW = "bi-university-planner-view";
const SCHEDULE_VIEW = "bi-university-schedule-view";
const FIXED_KEYS = [THEME, ACCOUNT, ROLE, PLANNER_VIEW];
export const BACKUP_SETTINGS_DOCUMENTS = { settings: { key: "bi-university-browser-settings", prefix: "bi-university-", label: "Настройки браузера" } } as const;
export const isBackupSettingKey = (key: string) => FIXED_KEYS.some((known) => key.startsWith(known)) || key.startsWith(SCHEDULE_VIEW);
type Account = Pick<CurrentUser, "id" | "role" | "status">;

// Schedule preferences use literal IDs after the role, unlike URI-encoded planner task keys.
const scheduleOwner = (key: string) => {
  const suffix = key.slice(SCHEDULE_VIEW.length + 1);
  const separator = suffix.indexOf(":");
  const role = suffix.slice(0, separator); const id = suffix.slice(separator + 1);
  return key.startsWith(`${SCHEDULE_VIEW}:`) && separator > 0 && isUserRole(role) && id.trim() ? id : undefined;
};

/** Read only archived scalar preferences; never apply themes, select accounts or choose fallbacks. */
export const inspectBackupSettings = async (entries: AdministrativeBackup["localStorage"], accounts?: readonly Account[], signal?: AbortSignal) => {
  const accountMap = accounts === undefined ? undefined : new Map(accounts.map((account) => [account.id, account]));
  const settings = new Map<string, string>();
  const issues: BackupDocumentIssue[] = [];
  let keys = 0; let invalid = 0; let index = 0;
  const finding = (level: "error" | "review", code: string, key: string, message: string) => issues.push({ kind: "settings", level, code, referenceId: key, message });
  const checkOwner = (key: string, owner: string) => {
    if (!accountMap) finding("review", "unchecked-setting-account", key, "Связь настройки с учётной записью не проверена: учётки отсутствуют или не читаются в архиве. Данные браузера не подставлялись.");
    else if (!accountMap.has(owner)) finding("error", "missing-setting-account", key, "Настройка ссылается на учётную запись, которой нет в архиве. Другой пользователь не выбирался.");
  };
  for (const entry of entries) {
    if (++index % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkBackupAbort(signal);
    if (!isBackupSettingKey(entry.key)) continue;
    keys++; settings.set(entry.key, entry.raw);
    if (entry.key === THEME || entry.key === ROLE || entry.key === PLANNER_VIEW) {
      const valid = entry.key === THEME ? ["dark", "light"].includes(entry.raw) : entry.key === ROLE ? isUserRole(entry.raw) : ["board", "list"].includes(entry.raw);
      if (!valid) { invalid++; finding("error", "invalid-setting-value", entry.key, "Значение настройки не входит в поддерживаемый набор. Исходное значение не включено в отчёт и не заменено значением по умолчанию."); }
    } else if (entry.key === ACCOUNT) {
      if (!entry.raw.trim()) { invalid++; finding("error", "invalid-setting-value", entry.key, "Не сохранён ID выбранной демонстрационной учётки. Другая учётная запись не подставлялась."); }
      else checkOwner(entry.key, entry.raw);
    } else if (entry.key.startsWith(`${SCHEDULE_VIEW}:`)) {
      const owner = scheduleOwner(entry.key);
      if (owner === undefined) { invalid++; finding("error", "unsupported-setting-key", entry.key, "Ключ вида расписания не содержит поддерживаемый тип и ID учётной записи. Настройка не переименована."); continue; }
      if (!["grid", "list"].includes(entry.raw)) { invalid++; finding("error", "invalid-setting-value", entry.key, "Не поддерживается сохранённый вид расписания. Значение не изменено."); }
      checkOwner(entry.key, owner);
    } else {
      invalid++; finding("error", "unsupported-setting-key", entry.key, "Найден неподдерживаемый ключ семейства настроек. Он не заменяет известную настройку и не переименован.");
    }
  }
  checkBackupAbort(signal);
  const selected = settings.get(ACCOUNT); const role = settings.get(ROLE);
  const account = selected === undefined ? undefined : accountMap?.get(selected);
  if (account && isUserRole(role) && account.role !== role) finding("review", "selected-role-mismatch", ROLE, "Сохранённый тип демонстрационной учётки отличается от типа выбранной записи в архиве. Приоритеты входа не менялись; настройку нужно проверить перед восстановлением.");
  if (account?.status === "blocked") finding("review", "blocked-selected-account", ACCOUNT, "В архиве выбрана заблокированная демонстрационная учётка. Перед восстановлением нужен отдельный выбор безопасного способа входа; блокировка не снималась.");
  if (selected === undefined && isUserRole(role)) finding("review", "legacy-role-selection", ROLE, "Выбор пользователя задан только типом учётки, без постоянного ID. Учётная запись не выбиралась автоматически; требуется проверка способа входа.");
  const checks: BackupDocumentCheck[] = [{ kind: "settings", key: BACKUP_SETTINGS_DOCUMENTS.settings.key, label: BACKUP_SETTINGS_DOCUMENTS.settings.label,
    status: !keys ? "absent" : invalid ? "invalid" : "valid", keys,
    message: !keys ? "Сохранённых настроек этих семейств нет в архиве. Значения по умолчанию не подставляются."
      : `Ключей: ${keys}; прочитано: ${keys - invalid}; не читается: ${invalid}. Проверены строковые значения известных настроек; учётки проверяются отдельно. Настройки не применялись, безопасный вход после восстановления ещё не подтверждён.`,
  }];
  return { checks, issues };
};
