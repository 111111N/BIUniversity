import type { AcademicLesson, LessonType } from "../domain/academic";
import { readManagedScheduleState } from "./managedScheduleStore";
import { DEMO_GROUPS, DEMO_SUBJECTS } from "./academicCatalog";
import type { ManagedScheduleSnapshot } from "../domain/scheduleManagement";

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
export const createSubjectLessons = (subjectId: string, groupId: string, now = Date.now(), journal: ManagedScheduleSnapshot["journal"] = readManagedScheduleState().snapshot.journal): AcademicLesson[] => {
  const legacy = DEMO_SUBJECTS.some((subject) => subject.id === subjectId) && DEMO_GROUPS.some((group) => group.id === groupId);
  const initial: AcademicLesson[] = (legacy ? initialLessonTemplates : []).map((lesson, index) => ({
    ...lesson,
    id: `${subjectId}:${groupId}:2026-fall:${index + 1}`,
    subjectId,
    groupId,
    semesterId: "2026-fall",
    state: "completed",
  }));
  const additional: AcademicLesson[] = (legacy ? weeklyTopics : []).flatMap((topic, week) => weeklySlots.map((slot): AcademicLesson => {
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
  // Legacy demo lessons and their marks keep their identities. Managed lessons have
  // their own namespace; removals remain visible as cancelled journal entries.
  const managed: AcademicLesson[] = journal
    .filter((lesson) => lesson.subjectId === subjectId && lesson.groupId === groupId)
    .map((lesson) => ({
      id: lesson.id, subjectId, groupId, semesterId: `${lesson.date.slice(0, 4)}-${Number(lesson.date.slice(5, 7)) >= 8 ? "fall" : "spring"}`,
      date: lesson.date, startsAt: lesson.startsAt, type: lesson.type, room: lesson.room,
      topic: "Занятие из опубликованного расписания",
      state: lesson.journalState !== "active" ? lesson.journalState : new Date(`${lesson.date}T${lesson.endsAt}`).getTime() <= now ? "completed" : "scheduled",
    }));
  return [...initial, ...additional, ...managed].sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
};
