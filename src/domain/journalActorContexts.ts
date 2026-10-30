import type { JournalChange } from "../data/journalStore";
import type { JournalTeachingArea } from "./journalTeachingArea";
import { checkBackupAbort } from "./localBackup";

type ActorContextRow = Readonly<Pick<JournalChange, "id" | "actor">>;
interface ActorContextFinding { id: string; level: "review"; code: string; message: string }

/** Compare captured claims with the current writer contract, never with today's account or lesson teacher. */
export const inspectJournalActorContexts = async (rows: readonly ActorContextRow[], area: JournalTeachingArea, signal?: AbortSignal) => {
  const issues: ActorContextFinding[] = []; let consistent = 0; let conflicting = 0; let incomplete = 0; let uncheckedArea = 0; let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  for (const row of rows) {
    await step();
    if (row.actor.role === undefined || (row.actor.role === "teacher" && row.actor.memberships === undefined)) {
      incomplete++;
      issues.push({ id: row.id, level: "review", code: "incomplete-journal-actor-context",
        message: "В событии не сохранена роль или учебные назначения автора. Соответствие контекста текущему контракту журнала не проверено; роль и назначения из учётки на момент выгрузки не подставлялись.",
      });
      continue;
    }
    if (row.actor.role !== "teacher") {
      conflicting++;
      issues.push({ id: row.id, level: "review", code: "conflicting-journal-actor-context",
        message: "Сохранённая роль автора не соответствует преподавателю, которого ожидает текущий контракт записи журнала. Нужно проверить правила исходной версии и полномочия на дату события; это не доказательство неправомерного изменения.",
      });
      continue;
    }
    // The list already reports its unresolved area; do not guess it from the actor's assignments.
    if (area.status !== "matched") { uncheckedArea++; continue; }
    let assigned = false;
    for (const membership of row.actor.memberships ?? []) {
      await step();
      if (membership.subjectId !== area.subjectId) continue;
      for (const groupId of membership.groupIds) {
        await step();
        if (groupId === area.groupId) { assigned = true; break; }
      }
      if (assigned) break;
    }
    if (assigned) { consistent++; continue; }
    conflicting++;
    issues.push({ id: row.id, level: "review", code: "conflicting-journal-actor-context",
      message: "Сохранённые назначения автора не содержат дисциплину и группу этого списка, которых требует текущий контракт записи журнала. Нужно проверить исходные правила и исторические полномочия; текущие назначения не подставлялись.",
    });
  }
  checkBackupAbort(signal);
  return { issues, consistent, conflicting, incomplete, uncheckedArea };
};
