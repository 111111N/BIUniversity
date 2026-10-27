import { parseCalendarDate } from "./calendar";
import { toLocalDateKey } from "./schedule";
import { getManagedWeekKey, validateManagedLesson, type ManagedLesson, type ManagedScheduleSnapshot } from "./scheduleManagement";
import { sameManagedScheduleVersions, type ManagedScheduleVersions } from "./scheduleVersions";

export interface ScheduleCopyRequest {
  groupId: string;
  sourceWeekStart: string;
  targetWeekStart: string;
  source: "draft" | "published";
}
export type ScheduleCopyVersions = ManagedScheduleVersions;

export const copyScheduleWeek = (
  snapshot: ManagedScheduleSnapshot,
  request: ScheduleCopyRequest,
  createIdentity: () => Pick<ManagedLesson, "id" | "scheduleId">,
): ManagedLesson[] => {
  if (!request.sourceWeekStart || !request.targetWeekStart || getManagedWeekKey(request.sourceWeekStart) !== request.sourceWeekStart || getManagedWeekKey(request.targetWeekStart) !== request.targetWeekStart) throw new Error("Выберите корректные недели с понедельника.");
  if (request.sourceWeekStart === request.targetWeekStart) throw new Error("Выберите другую исходную неделю.");
  if (request.source !== "draft" && request.source !== "published") throw new Error("Выберите черновик или опубликованную неделю.");
  const source = (request.source === "draft" ? snapshot.drafts : snapshot.published).find((week) => week.groupId === request.groupId && week.weekStart === request.sourceWeekStart);
  if (!source) throw new Error("Исходная неделя не найдена. Обновите список.");
  if (!source.lessons.length) throw new Error("В исходной неделе нет занятий для копирования.");
  const occupiedIds = new Set<string>();
  const occupiedScheduleIds = new Set<number>();
  for (const lesson of [...snapshot.drafts, ...snapshot.published].flatMap((week) => week.lessons).concat(snapshot.journal)) {
    occupiedIds.add(lesson.id); occupiedScheduleIds.add(lesson.scheduleId);
  }
  return source.lessons.map((lesson) => {
    if (lesson.groupId !== request.groupId || getManagedWeekKey(lesson.date) !== source.weekStart || validateManagedLesson(lesson).length) throw new Error("Исходная неделя содержит некорректное занятие.");
    const targetDate = parseCalendarDate(request.targetWeekStart)!;
    targetDate.setDate(targetDate.getDate() + parseCalendarDate(lesson.date)!.getDay() - 1);
    const identity = createIdentity();
    const copy = { ...lesson, ...identity, date: toLocalDateKey(targetDate) };
    if (validateManagedLesson(copy).length || getManagedWeekKey(copy.date) !== request.targetWeekStart || occupiedIds.has(copy.id) || occupiedScheduleIds.has(copy.scheduleId)) throw new Error("Не удалось выдать новые идентификаторы копии. Повторите проверку.");
    occupiedIds.add(copy.id); occupiedScheduleIds.add(copy.scheduleId);
    return copy;
  });
};

export const sameScheduleCopyVersions = sameManagedScheduleVersions;
