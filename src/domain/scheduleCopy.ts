import { parseCalendarDate } from "./calendar";
import { toLocalDateKey } from "./schedule";
import { getManagedWeekKey, validateManagedLesson, type ManagedLesson, type ManagedScheduleSnapshot } from "./scheduleManagement";
import { sameManagedScheduleVersions, type ManagedScheduleVersions } from "./scheduleVersions";

export interface ScheduleCopyRequest {
  groupId: string;
  sourceGroupId?: string;
  sourceWeekStart: string;
  targetWeekStart: string;
  source: "draft" | "published" | "publication";
  publicationId?: string;
  templateId?: string;
}
export type ScheduleCopyVersions = ManagedScheduleVersions;

const sourceWeek = (snapshot: ManagedScheduleSnapshot, request: ScheduleCopyRequest) => {
  if (!request.sourceWeekStart || !request.targetWeekStart || getManagedWeekKey(request.sourceWeekStart) !== request.sourceWeekStart || getManagedWeekKey(request.targetWeekStart) !== request.targetWeekStart) throw new Error("Выберите корректные недели с понедельника.");
  const sourceGroupId = request.sourceGroupId ?? request.groupId;
  if (!sourceGroupId?.trim() || !request.groupId?.trim()) throw new Error("Выберите исходную группу и группу назначения.");
  if (request.sourceWeekStart === request.targetWeekStart && sourceGroupId === request.groupId) throw new Error("Выберите другую исходную неделю или группу.");
  if (!["draft", "published", "publication"].includes(request.source)) throw new Error("Выберите черновик, опубликованную неделю или шаблон.");
  const source = request.source === "publication" ? snapshot.publications?.find(version => version.id === request.publicationId && version.week.groupId === sourceGroupId && version.week.weekStart === request.sourceWeekStart)?.week
    : (request.source === "draft" ? snapshot.drafts : snapshot.published).find(week => week.groupId === sourceGroupId && week.weekStart === request.sourceWeekStart);
  if (!source) throw new Error("Исходная неделя не найдена. Обновите список.");
  if (!source.lessons.length) throw new Error("В исходной неделе нет занятий для копирования.");
  return source;
};
const targetDate = (date: string, targetWeekStart: string) => {
  const target = parseCalendarDate(targetWeekStart)!, source = parseCalendarDate(date);
  if (!source) throw new Error("Дата исходного занятия некорректна.");
  target.setDate(target.getDate() + source.getDay() - 1);
  return toLocalDateKey(target);
};
export const getScheduleCopyTargetDates = (snapshot: ManagedScheduleSnapshot, request: ScheduleCopyRequest) => sourceWeek(snapshot, request).lessons.map(lesson => targetDate(lesson.date, request.targetWeekStart));

export const copyScheduleWeek = (
  snapshot: ManagedScheduleSnapshot,
  request: ScheduleCopyRequest,
  createIdentity: () => Pick<ManagedLesson, "id" | "scheduleId">,
): ManagedLesson[] => {
  const source = sourceWeek(snapshot, request);
  const occupiedIds = new Set<string>();
  const occupiedScheduleIds = new Set<number>();
  for (const lesson of [...snapshot.drafts, ...snapshot.published].flatMap((week) => week.lessons).concat(snapshot.journal, snapshot.publications?.flatMap(version => version.week.lessons) ?? [])) {
    occupiedIds.add(lesson.id); occupiedScheduleIds.add(lesson.scheduleId);
  }
  return source.lessons.map((lesson) => {
    if (lesson.groupId !== source.groupId || getManagedWeekKey(lesson.date) !== source.weekStart || validateManagedLesson(lesson).length) throw new Error("Исходная неделя содержит некорректное занятие.");
    const identity = createIdentity();
    const copy = { ...lesson, ...identity, groupId: request.groupId, date: targetDate(lesson.date, request.targetWeekStart) };
    delete copy.teachingAssignmentId; delete copy.teachingAssignmentRevision;
    if (validateManagedLesson(copy).length || getManagedWeekKey(copy.date) !== request.targetWeekStart || occupiedIds.has(copy.id) || occupiedScheduleIds.has(copy.scheduleId)) throw new Error("Не удалось выдать новые идентификаторы копии. Повторите проверку.");
    occupiedIds.add(copy.id); occupiedScheduleIds.add(copy.scheduleId);
    return copy;
  });
};

export const sameScheduleCopyVersions = sameManagedScheduleVersions;
