import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import type { JournalTeachingArea } from "./journalTeachingArea";
import { checkBackupAbort } from "./localBackup";

type LessonStatus = "matched" | "unchecked-area" | "legacy" | "unavailable" | "draft-only" | "missing" | "foreign-area";
export interface JournalLessonReference { lessonId: string; recordId: string }
interface LessonFinding { level: "review"; code: string; message: string; recordId?: string }

/** Retained schedule entries, including cancelled/rescheduled ones, define archived lesson identities. */
export const createArchivedJournalLessonIndex = async (schedule: ManagedScheduleSnapshot | undefined, signal?: AbortSignal) => {
  const lessons = new Map<string, Map<string, Set<string>>>(); const draftIds = new Set<string>(); let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  for (const lesson of schedule?.journal ?? []) {
    await step();
    let subjects = lessons.get(lesson.id);
    if (!subjects) { subjects = new Map(); lessons.set(lesson.id, subjects); }
    let groups = subjects.get(lesson.subjectId);
    if (!groups) { groups = new Set(); subjects.set(lesson.subjectId, groups); }
    groups.add(lesson.groupId);
  }
  for (const week of schedule?.drafts ?? []) {
    await step();
    for (const lesson of week.lessons) { await step(); draftIds.add(lesson.id); }
  }
  checkBackupAbort(signal);
  return {
    resolve(lessonId: string, area: JournalTeachingArea): LessonStatus {
      if (area.status !== "matched") return "unchecked-area";
      if (!lessonId.startsWith("managed:")) return "legacy";
      if (!schedule) return "unavailable";
      const subjects = lessons.get(lessonId);
      if (subjects?.get(area.subjectId)?.has(area.groupId)) return "matched";
      if (subjects) return "foreign-area";
      return draftIds.has(lessonId) ? "draft-only" : "missing";
    },
  };
};

export const inspectJournalLessonReferences = async (
  references: Iterable<JournalLessonReference>, index: Awaited<ReturnType<typeof createArchivedJournalLessonIndex>>,
  area: JournalTeachingArea, signal?: AbortSignal,
) => {
  const issues: LessonFinding[] = []; let matched = 0; let unresolved = 0; let count = 0; let unavailableReported = false;
  for (const reference of references) {
    if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkBackupAbort(signal);
    const status = index.resolve(reference.lessonId, area);
    if (status === "matched") { matched++; continue; }
    unresolved++;
    // The source list already reports its unresolved area; do not repeat it for every cell.
    if (status === "unchecked-area") continue;
    if (status === "unavailable") {
      if (!unavailableReported) issues.push({ level: "review", code: "unchecked-journal-lessons",
        message: "Связи с занятиями не проверены: расписание отсутствует или не читается в архиве. Черновики, данные браузера и занятия по совпадению даты не подставлялись.",
      });
      unavailableReported = true; continue;
    }
    issues.push({ level: "review", code: `${status}-journal-lesson`, recordId: reference.recordId,
      message: status === "legacy"
        ? "Сохранённый ключ занятия не относится к стабильным ID управляемого расписания. Историческая связь не подтверждена; занятие по дате, названию или встроенному примеру не подбиралось."
        : status === "draft-only"
          ? "ID занятия найден только в черновиках расписания, а не в сохранённой истории опубликованных занятий. Связь с результатами требует проверки; черновик не принят за проведённую пару."
          : status === "foreign-area"
            ? "ID занятия есть в истории расписания, но для другой дисциплины или группы. Связь требует проверки; результат и занятие не переносились в другую учебную область."
            : "ID занятия отсутствует в сохранённой истории расписания. Связь требует проверки; отсутствующая пара не создавалась и не подбиралась по дате.",
    });
  }
  checkBackupAbort(signal);
  return { issues, matched, unresolved };
};
