import { decodeAccountsDocument, getStudentGroupId, isAccountActive, type AccountsDocument } from "./accounts";
import { decodeGroupCatalog, type GroupCatalogDocument } from "./groupCatalog";
import { decodeSubjectCatalog, type SubjectCatalogDocument } from "./subjectCatalog";
import { decodeManagedSchedule, MANAGED_SCHEDULE_KEY, type ManagedScheduleSnapshot } from "./scheduleManagement";
import { checkBackupAbort, type AdministrativeBackup } from "./localBackup";

export const BACKUP_CORE_DOCUMENTS = {
  accounts: { key: "bi-university-accounts-v1", prefix: "bi-university-accounts-", label: "Учётные записи" },
  groups: { key: "bi-university-group-catalog-v1", prefix: "bi-university-group-catalog-", label: "Группы" },
  subjects: { key: "bi-university-subject-catalog-v1", prefix: "bi-university-subject-catalog-", label: "Дисциплины" },
  schedule: { key: MANAGED_SCHEDULE_KEY, prefix: "bi-university-managed-schedule-", label: "Расписание" },
} as const;
export type BackupDocumentKind = keyof typeof BACKUP_CORE_DOCUMENTS;
export interface BackupDocumentBaseline { groupIds: readonly string[]; requiredSubjectIds: readonly string[] }
export interface BackupDocumentCheck {
  kind: BackupDocumentKind; key: string; label: string; status: "valid" | "invalid" | "absent"; message: string; revision?: number;
}
export interface BackupDocumentIssue {
  level: "error" | "review"; kind: BackupDocumentKind; code: string; message: string; referenceId?: string;
}
export interface BackupDocumentReview {
  checks: BackupDocumentCheck[]; issues: BackupDocumentIssue[];
  counts: { valid: number; invalid: number; absent: number; unchecked: number; errors: number; reviews: number; hiddenIssues: number };
}
const NO_BASELINE: BackupDocumentBaseline = { groupIds: [], requiredSubjectIds: [] };

/** Inspect only archived documents; live stores and inferred demo accounts never fill gaps. */
export async function inspectBackupDocuments(archive: AdministrativeBackup, actorId: string, baseline = NO_BASELINE, signal?: AbortSignal): Promise<BackupDocumentReview> {
  checkBackupAbort(signal);
  const rows = new Map(archive.localStorage.map((entry) => [entry.key, entry.raw]));
  const result: BackupDocumentReview = { checks: [], issues: [], counts: { valid: 0, invalid: 0, absent: 0, unchecked: 0, errors: 0, reviews: 0, hiddenIssues: 0 } };
  const seen = new Set<string>();
  const issue = (value: BackupDocumentIssue) => {
    const id = JSON.stringify([value.kind, value.code, value.referenceId ?? ""]);
    if (seen.has(id)) return; seen.add(id);
    if (value.level === "error") result.counts.errors++; else result.counts.reviews++;
    if (result.issues.length < 200) result.issues.push(value); else result.counts.hiddenIssues++;
  };
  const read = async <T,>(kind: BackupDocumentKind, decode: (raw: string) => T): Promise<T | undefined> => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal);
    const definition = BACKUP_CORE_DOCUMENTS[kind]; const raw = rows.get(definition.key);
    if (raw === undefined) {
      result.checks.push({ kind, key: definition.key, label: definition.label, status: "absent", message: "Не сохранён в архиве. Данные браузера и встроенные примеры не подставляются." }); result.counts.absent++; return;
    }
    try {
      const header: unknown = JSON.parse(raw);
      if (!header || typeof header !== "object" || Array.isArray(header) || !("version" in header) || header.version !== 1) throw new Error("Поддерживается только документ версии 1.");
      const document = decode(raw);
      const revision = "revision" in header && typeof header.revision === "number" ? header.revision : undefined;
      result.checks.push({ kind, key: definition.key, label: definition.label, status: "valid", revision, message: "Схема прочитана текущей версией приложения. Это не разрешение на восстановление." }); result.counts.valid++;
      return document;
    } catch (reason) {
      const message = reason instanceof SyntaxError ? "Некорректный JSON внутри документа." : reason instanceof Error ? reason.message : "Документ не удалось прочитать.";
      result.checks.push({ kind, key: definition.key, label: definition.label, status: "invalid", message }); result.counts.invalid++;
      issue({ level: "error", kind, code: "invalid-document", message });
    }
  };
  for (const entry of archive.localStorage) {
    const definition = Object.entries(BACKUP_CORE_DOCUMENTS).find(([, value]) => entry.key.startsWith(value.prefix));
    if (definition && entry.key !== definition[1].key) issue({ level: "error", kind: definition[0] as BackupDocumentKind, code: "unsupported-key", referenceId: entry.key, message: "Найдена неподдерживаемая версия ключа. Она не заменяет документ версии 1 и не будет пропущена при планировании восстановления." });
    if (!Object.values(BACKUP_CORE_DOCUMENTS).some((value) => value.key === entry.key)) result.counts.unchecked++;
  }
  const accounts: AccountsDocument | undefined = await read("accounts", decodeAccountsDocument);
  const groups: GroupCatalogDocument | undefined = await read("groups", decodeGroupCatalog);
  const subjects: SubjectCatalogDocument | undefined = await read("subjects", (raw) => {
    const document = decodeSubjectCatalog(raw);
    const ids = new Set(document.subjects.map((subject) => subject.id));
    if (baseline.requiredSubjectIds.some((id) => !ids.has(id))) throw new Error("В каталоге отсутствуют встроенные дисциплины текущей версии приложения.");
    return document;
  });
  const schedule: ManagedScheduleSnapshot | undefined = await read("schedule", (raw) => {
    const document = decodeManagedSchedule(raw);
    if (!document) throw new Error("Некорректная схема расписания, повторяющиеся идентификаторы или нарушена связь опубликованных занятий с журналом.");
    return document;
  });
  const accountIds = accounts ? new Set(accounts.accounts.map((account) => account.id)) : undefined;
  const groupIds = groups ? new Set([...baseline.groupIds, ...groups.groups.map((group) => group.id)]) : undefined;
  const savedGroupIds = new Set(groups?.groups.map((group) => group.id) ?? []);
  const subjectIds = subjects ? new Set(subjects.subjects.map((subject) => subject.id)) : undefined;
  let builtInGroups = false; let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const reference = (kind: BackupDocumentKind, target: "group" | "subject" | "teacher", id: string) => {
    const ids = target === "group" ? groupIds : target === "subject" ? subjectIds : accountIds;
    if (!ids) {
      issue({ level: "review", kind, code: `unchecked-${target}`, message: `Связи с ${target === "group" ? "группами" : target === "subject" ? "дисциплинами" : "преподавателями"} не проверены: соответствующий документ отсутствует или не читается.` }); return;
    }
    if (!ids.has(id)) issue({ level: "error", kind, code: `missing-${target}`, referenceId: id, message: `Ссылка ведёт на отсутствующую ${target === "group" ? "группу" : target === "subject" ? "дисциплину" : "учётную запись преподавателя"}.` });
    else if (target === "group" && !savedGroupIds.has(id)) builtInGroups = true;
  };
  if (accounts) {
    const actor = accounts.accounts.find((account) => account.id === actorId);
    if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) issue({ level: "error", kind: "accounts", code: "actor-access", message: "Текущий настройщик не сохранит доступ по этому набору учёток. До восстановления нужен отдельный выбор и проверка способа входа." });
    for (const account of accounts.accounts) {
      await step();
      const group = getStudentGroupId(account); if (group) reference("accounts", "group", group);
      for (const membership of account.memberships) {
        await step(); reference("accounts", "subject", membership.subjectId);
        for (const groupId of membership.groupIds) { await step(); reference("accounts", "group", groupId); }
      }
    }
  } else issue({ level: "review", kind: "accounts", code: "unchecked-access", message: "Нельзя проверить доступ настройщика после восстановления: учётки отсутствуют или не читаются." });
  if (schedule) {
    for (const week of [...schedule.drafts, ...schedule.published]) { await step(); reference("schedule", "group", week.groupId); }
    for (const collection of [...schedule.drafts.map((week) => week.lessons), ...schedule.published.map((week) => week.lessons), schedule.journal]) {
      for (const lesson of collection) {
        await step(); reference("schedule", "group", lesson.groupId); reference("schedule", "subject", lesson.subjectId); reference("schedule", "teacher", lesson.teacherId);
      }
    }
  }
  if (builtInGroups) issue({ level: "review", kind: "groups", code: "built-in-groups", message: "Часть ссылок совпадает со встроенными группами текущего приложения, но их определения отсутствуют в архиве. Совместимость исходной версии ещё не подтверждена." });
  checkBackupAbort(signal);
  return result;
}
