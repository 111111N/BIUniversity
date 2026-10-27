import { isGroupActive, type GroupStatus } from "./groupCatalog";
import { getManagedWeekKey, getManagedLessonIssues, type ManagedLesson } from "./scheduleManagement";
import type { AcademicMembership } from "./accounts";

export const resolveScheduleEditingScope = (group: string | null, date: string | null, groups: { id: string; status?: GroupStatus }[], today: string) => {
  const groupId = group === null ? (groups.find(isGroupActive) ?? groups[0])?.id ?? "" : groups.find((entry) => entry.id === group)?.id ?? "";
  const weekStart = getManagedWeekKey(date === null ? today : date);
  const errors: { group?: string; date?: string } = {};
  if (!groupId) errors.group = group === null ? "Нет доступных учебных групп." : "Группа из ссылки не найдена. Выберите нужную группу явно.";
  if (!weekStart) errors.date = "Дата в ссылке некорректна. Выберите неделю перед редактированием.";
  return { groupId, weekStart, errors, valid: !errors.group && !errors.date };
};
export type LessonEditorErrors = Partial<Record<keyof ManagedLesson | "form", string>>;
export const restoreRemovedScheduleLesson = (lessons: ManagedLesson[], removed: ManagedLesson): ManagedLesson[] => {
  if (lessons.some((lesson) => lesson.id === removed.id || lesson.scheduleId === removed.scheduleId)) throw new Error("Эта пара уже есть в рабочей неделе. Список не изменён.");
  return [...lessons, { ...removed }].sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt));
};
export const validateLessonEditor = (lesson: ManagedLesson, weekStart: string, teachers: { id: string; memberships: AcademicMembership[] }[]): LessonEditorErrors => {
  const errors: LessonEditorErrors = {};
  for (const issue of getManagedLessonIssues(lesson)) {
    const field = issue.field === "id" || issue.field === "groupId" ? "form" : issue.field;
    errors[field] ??= issue.message;
  }
  if (getManagedWeekKey(lesson.date) !== weekStart) errors.date ??= "Выберите дату внутри открытой недели.";
  const teacher = teachers.find((entry) => entry.id === lesson.teacherId);
  if (!teacher?.memberships.some((membership) => membership.subjectId === lesson.subjectId && membership.groupIds.includes(lesson.groupId))) errors.teacherId ??= "Преподаватель не назначен на эту дисциплину и группу. Проверьте назначения.";
  return errors;
};
