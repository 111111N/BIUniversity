import type { WeeklyScheduleData } from "../types/sched";
import { getWeekStart, toLocalDateKey } from "../domain/schedule";
import { getAcademicGroupByName, getAcademicGroupNameAt, getAcademicSubjectDefinition } from "./academicCatalog";
import { createDemoWeekSchedule, DEMO_STUDENT_GROUP, DEMO_TEACHER } from "./demoSchedule";
import { readManagedScheduleState } from "./managedScheduleStore";
import type { AcademicMembership } from "./academicCatalog";

export { DEMO_STUDENT_GROUP, DEMO_TEACHER } from "./demoSchedule";

// Повторяемая демонстрационная неделя до подключения API вуза.
export const getDemoWeekSchedule = (date: Date): WeeklyScheduleData => {
  const weekStart = toLocalDateKey(getWeekStart(date));
  const { snapshot, error } = readManagedScheduleState();
  if (error) return [];
  const managed = snapshot.published.filter((week) => week.weekStart === weekStart);
  const replacedGroups = new Set(managed.map((week) => week.groupId));
  return [...createDemoWeekSchedule(date).filter((lesson) => !replacedGroups.has(getAcademicGroupByName(lesson.group)?.id ?? "")), ...managed.flatMap((week) => week.lessons.map((lesson) => ({
    id: lesson.scheduleId, date: lesson.date, dayOfWeek: new Date(`${lesson.date}T12:00`).getDay(),
    subject: getAcademicSubjectDefinition(lesson.subjectId)?.name ?? lesson.subjectId,
    group: getAcademicGroupNameAt(lesson.groupId, `${lesson.date}T${lesson.startsAt}:00+03:00`),
    teacherId: lesson.teacherId, teacher: lesson.teacherName, startTime: lesson.startsAt, endTime: lesson.endsAt,
    type: lesson.type === "lecture" ? "Лек." as const : lesson.type === "laboratory" ? "Лаб." as const : "Пр." as const,
    location: `Ауд. ${lesson.room.replace(/^ауд[.]?\s*/iu, "")}`,
  })))].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.id - b.id);
};

/* Compatibility export: public callers keep the old name while the source can become an API. */
type ScheduleUser = { id: string; role: "teacher" | "student" | "configurator"; scheduleName?: string; memberships: AcademicMembership[] };
export const getPersonalSchedule = (schedule: WeeklyScheduleData, user: ScheduleUser | ScheduleUser["role"]) => {
  if (typeof user === "string") return user === "configurator" ? [] : schedule.filter((lesson) => user === "student" ? lesson.group === DEMO_STUDENT_GROUP : lesson.teacher === DEMO_TEACHER);
  if (user.role === "configurator") return [];
  return schedule.filter((lesson) => user.role === "teacher"
    ? lesson.teacherId ? lesson.teacherId === user.id : Boolean(user.scheduleName && lesson.teacher === user.scheduleName)
    : user.memberships.some((membership) => membership.groupIds.includes(getAcademicGroupByName(lesson.group)?.id ?? "")));
};
