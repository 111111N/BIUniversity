import type { ManagedLesson } from "./scheduleManagement";

export const PUBLICATION_FIELD_LABELS = { subjectId: "Дисциплина", groupId: "Группа", teacherId: "Преподаватель", teacherName: "Имя преподавателя", date: "Дата", startsAt: "Начало", endsAt: "Окончание", type: "Тип занятия", room: "Аудитория" };
export type PublicationChangeField = keyof typeof PUBLICATION_FIELD_LABELS;
export type PublicationChangeKind = "added" | "changed" | "removed";
export interface PublicationChange { id: string; kind: PublicationChangeKind; before?: ManagedLesson; after?: ManagedLesson; fields: PublicationChangeField[] }
export interface PublicationComparison { rows: PublicationChange[]; counts: Record<PublicationChangeKind | "unchanged", number> }

export const compareSchedulePublication = (before: ManagedLesson[], after: ManagedLesson[]): PublicationComparison => {
  const previous = new Map(before.map((lesson) => [lesson.id, lesson]));
  const next = new Map(after.map((lesson) => [lesson.id, lesson]));
  if (previous.size !== before.length || next.size !== after.length) throw new Error("Нельзя сравнить занятия с повторяющимися идентификаторами.");
  const rows: PublicationChange[] = [];
  const counts = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  for (const lesson of after) {
    const old = previous.get(lesson.id);
    if (!old) { counts.added++; rows.push({ id: lesson.id, kind: "added", after: { ...lesson }, fields: [] }); continue; }
    if (old.scheduleId !== lesson.scheduleId) throw new Error("Числовой идентификатор существующего занятия изменён. Проверьте целостность расписания.");
    const fields = (Object.keys(PUBLICATION_FIELD_LABELS) as PublicationChangeField[]).filter((field) => old[field] !== lesson[field]);
    if (!fields.length) { counts.unchanged++; continue; }
    counts.changed++; rows.push({ id: lesson.id, kind: "changed", before: { ...old }, after: { ...lesson }, fields });
  }
  for (const lesson of before) if (!next.has(lesson.id)) { counts.removed++; rows.push({ id: lesson.id, kind: "removed", before: { ...lesson }, fields: [] }); }
  rows.sort((a, b) => {
    const left = a.after ?? a.before!; const right = b.after ?? b.before!;
    return left.date.localeCompare(right.date) || left.startsAt.localeCompare(right.startsAt) || a.id.localeCompare(b.id);
  });
  return { rows, counts };
};
