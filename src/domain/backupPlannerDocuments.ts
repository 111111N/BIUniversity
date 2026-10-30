import { checkBackupAbort, type AdministrativeBackup } from "./localBackup";
import type { BackupDocumentCheck, BackupDocumentIssue } from "./localBackupDocuments";
import { getPlannerStorageOwner, PLANNER_STORAGE_KEY } from "./plannerStorage";

export const BACKUP_PLANNER_DOCUMENTS = { planners: { key: PLANNER_STORAGE_KEY, prefix: PLANNER_STORAGE_KEY, label: "Планировщики" } } as const;
export const isBackupPlannerKey = (key: string) => key.startsWith(PLANNER_STORAGE_KEY);
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const decodeNotes = (raw: string): Record<string, unknown>[] => {
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || !rows.every((row: unknown) => isRecord(row) && typeof row.id === "string" && Boolean(row.id.trim())
    && typeof row.title === "string" && date(row.createdAt)
    && (row.text === undefined || typeof row.text === "string")
    && (row.startAt === undefined || date(row.startAt)) && (row.endAt === undefined || date(row.endAt))
    && (row.completed === undefined || typeof row.completed === "boolean")
    && (row.priority === undefined || ["low", "medium", "high"].includes(row.priority as string))
    && (row.category === undefined || ["study", "personal"].includes(row.category as string)))) {
    throw new Error("Не читается схема задач планировщика: проверьте ID, текстовые поля, даты, состояние выполнения, приоритет и категорию. Записи не исправлялись и не отбрасывались.");
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("В списке задач планировщика повторяются ID. Задачи не объединялись и не удалялись.");
  return rows;
};

/** Archive ownership is checked only against archived accounts, regardless of their current role/status. */
export const inspectBackupPlanners = async (entries: AdministrativeBackup["localStorage"], accountIds?: ReadonlySet<string>, signal?: AbortSignal) => {
  const issues: BackupDocumentIssue[] = [];
  let documents = 0; let invalid = 0; let records = 0; let index = 0;
  for (const entry of entries) {
    if (++index % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkBackupAbort(signal);
    if (!isBackupPlannerKey(entry.key)) continue;
    documents++;
    const owner = getPlannerStorageOwner(entry.key);
    if (owner === undefined) {
      invalid++;
      issues.push({ kind: "planners", level: "error", code: "unsupported-planner-key", referenceId: entry.key, message: "Ключ планировщика не соответствует текущему формату или неоднозначно задаёт владельца. Список не переименован и не объединён с другим." });
      continue;
    }
    if (!accountIds) issues.push({ kind: "planners", level: "review", code: "unchecked-planner-owner", referenceId: entry.key, message: "Владелец планировщика не проверен: учётные записи отсутствуют или не читаются в архиве. Учётки браузера не подставлялись." });
    else if (!accountIds.has(owner)) issues.push({ kind: "planners", level: "error", code: "missing-planner-owner", referenceId: entry.key, message: "В архиве нет учётной записи владельца этого планировщика. Задачи не переданы другому пользователю." });
    try {
      const notes = decodeNotes(entry.raw); records += notes.length;
      for (const note of notes) {
        if (date(note.startAt) && date(note.endAt) && Date.parse(note.endAt) <= Date.parse(note.startAt)) issues.push({
          kind: "planners", level: "error", code: "invalid-planner-interval", referenceId: entry.key, recordId: note.id as string,
          message: "Время окончания задачи не позже времени начала. Даты не изменены.",
        });
      }
    } catch (error) {
      invalid++;
      issues.push({ kind: "planners", level: "error", code: "invalid-planner-document", referenceId: entry.key,
        message: error instanceof SyntaxError ? "Некорректный JSON списка задач. Исходный текст не включён в отчёт." : error instanceof Error ? error.message : "Не удалось проверить список задач планировщика.",
      });
    }
  }
  checkBackupAbort(signal);
  const checks: BackupDocumentCheck[] = [{ kind: "planners", key: PLANNER_STORAGE_KEY, label: BACKUP_PLANNER_DOCUMENTS.planners.label, documents,
    status: !documents ? "absent" : invalid ? "invalid" : "valid", ...(documents && !invalid ? { records } : {}),
    message: !documents ? "Сохранённых списков планировщика нет в архиве. Демонстрационные задачи не подставляются."
      : `Списков: ${documents}; прочитано: ${documents - invalid}; не читается: ${invalid}. Структура задач и владельцы проверяются отдельно; замечания не изменяют задачи.`,
  }];
  return { checks, issues };
};
