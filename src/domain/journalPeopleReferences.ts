import { checkBackupAbort } from "./localBackup";

export interface JournalPersonReference { accountId: string; recordId: string; target: "student" | "actor" }
interface PersonFinding { level: "review"; code: string; message: string; recordId?: string }

/** Account existence does not prove historical role, enrollment, membership or permission to edit. */
export const inspectJournalPeopleReferences = async (references: Iterable<JournalPersonReference>, accountIds?: ReadonlySet<string>, signal?: AbortSignal) => {
  const issues: PersonFinding[] = []; let matched = 0; let missing = 0; let unchecked = 0; let count = 0;
  for (const reference of references) {
    if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkBackupAbort(signal);
    if (!accountIds) {
      if (!unchecked) issues.push({ level: "review", code: "unchecked-journal-people",
        message: "Связи журнала с людьми не проверены: учётные записи отсутствуют или не читаются в архиве. Учётки браузера, имена и встроенные пользователи не подставлялись.",
      });
      unchecked++; continue;
    }
    if (accountIds.has(reference.accountId)) { matched++; continue; }
    missing++;
    issues.push({ level: "review", code: `missing-journal-${reference.target}-account`, recordId: reference.recordId,
      message: reference.target === "actor"
        ? "В архиве нет учётной записи с ID автора события журнала. Исторический автор требует проверки; совпадение имени не использовалось для замены, событие не удалялось."
        : "В архиве нет учётной записи с ID студента из журнала или его истории. Историческая или демонстрационная связь требует проверки; текущий состав группы и совпадение ФИО не использовались для замены.",
    });
  }
  checkBackupAbort(signal);
  return { issues, matched, missing, unchecked };
};
