import type { AcademicLesson, LessonType } from "../domain/academic";

const initialLessonTemplates: Array<{ date: string; startsAt: string; type: LessonType; topic: string; room: string }> = [
  { date: "2026-09-04", startsAt: "10:10", type: "lecture", topic: "Введение в дисциплину", room: "305" },
  { date: "2026-09-07", startsAt: "12:10", type: "practice", topic: "Основные понятия", room: "214" },
  { date: "2026-09-08", startsAt: "10:10", type: "lecture", topic: "Методы решения задач", room: "305" },
  { date: "2026-09-09", startsAt: "14:10", type: "laboratory", topic: "Практическое исследование", room: "412" },
  { date: "2026-09-10", startsAt: "12:10", type: "practice", topic: "Разбор результатов", room: "214" },
];

const weeklyTopics = ["Методы и примеры", "Самостоятельное исследование", "Проверка гипотез", "Работа с исходными данными", "Сравнение решений", "Контрольный практикум", "Разбор сложных случаев", "Обобщение результатов"];
const weeklySlots: Array<{ day: number; startsAt: string; type: LessonType; room: string }> = [
  { day: 0, startsAt: "08:30", type: "lecture", room: "305" },
  { day: 2, startsAt: "12:10", type: "practice", room: "214" },
  { day: 4, startsAt: "13:50", type: "laboratory", room: "412" },
];

/** Stable catalog: old lesson IDs remain valid; new dates are empty until an explicit demo import. */
export const createSubjectLessons = (subjectId: string, groupId: string): AcademicLesson[] => {
  const initial: AcademicLesson[] = initialLessonTemplates.map((lesson, index) => ({
    ...lesson,
    id: `${subjectId}:${groupId}:2026-fall:${index + 1}`,
    subjectId,
    groupId,
    semesterId: "2026-fall",
    state: "completed",
  }));
  const now = Date.now();
  const additional: AcademicLesson[] = weeklyTopics.flatMap((topic, week) => weeklySlots.map((slot): AcademicLesson => {
    const day = new Date(2026, 8, 14 + week * 7 + slot.day, 12);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    return {
      id: `${subjectId}:${groupId}:2026-fall:weekly:${date}:${slot.type}`,
      subjectId, groupId, semesterId: "2026-fall", date, startsAt: slot.startsAt, type: slot.type,
      topic: `${topic} · ${slot.type === "lecture" ? "теория" : slot.type === "practice" ? "решение задач" : "исследование"}`,
      room: slot.room,
      state: new Date(`${date}T${slot.startsAt}`).getTime() + 90 * 60_000 <= now ? "completed" : "scheduled",
    };
  }));
  return [...initial, ...additional];
};
