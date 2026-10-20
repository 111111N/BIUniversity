import type { AcademicLesson } from "./academic";
import type { JournalChange } from "../data/journalStore";
import { createCsv } from "./csv";

export const journalFieldLabels: Record<JournalChange["field"], string> = { attendance: "Посещаемость", grade: "Оценка", roster: "Состав группы", demo: "Демонстрационное наполнение" };
const attendanceLabels: Record<string, string> = { unmarked: "Не отмечено", present: "Присутствие", sick: "Уважительная причина", absent: "Пропуск" };
const rosterLabels: Record<string, string> = { added: "Добавлен", active: "В группе", removed: "Удалён" };
export type JournalChangeGroup = { id: string; changedAt: string; actorName: string; changes: JournalChange[] };
export const formatJournalChangeValue = (value: JournalChange["previousValue"], field: JournalChange["field"]) => {
  if (value === null) return field === "grade" ? "Без оценки" : field === "attendance" ? "Не отмечено" : "—";
  return (field === "attendance" ? attendanceLabels[String(value)] : field === "roster" ? rosterLabels[String(value)] : undefined) ?? String(value);
};

export const groupJournalChanges = (changes: JournalChange[]) => {
  const groups = new Map<string, JournalChangeGroup>();
  [...changes].sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt)).forEach((change) => {
    const id = `${change.changedAt}:${change.actor.id}`;
    const group: JournalChangeGroup = groups.get(id) ?? { id, changedAt: change.changedAt, actorName: change.actor.name, changes: [] };
    group.changes.push(change); groups.set(id, group);
  });
  return Array.from(groups.values());
};

export const createHistoryCsv = (changes: JournalChange[], lessons: AcademicLesson[]) => {
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  return createCsv([["Время изменения", "Автор", "Студент", "Поле", "Дата занятия", "Тема", "Было", "Стало"], ...changes.map((change) => {
    const lesson = change.lessonId ? byId.get(change.lessonId) : undefined;
    return [new Date(change.changedAt).toLocaleString("ru-RU"), change.actor.name, change.studentName, journalFieldLabels[change.field], lesson?.date ?? "", lesson?.topic ?? "", formatJournalChangeValue(change.previousValue, change.field), formatJournalChangeValue(change.nextValue, change.field)];
  })]);
};
