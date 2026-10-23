import type { WeeklyScheduleData } from "../types/sched";
import { getWeekStart, toLocalDateKey } from "../domain/schedule";
import { DEMO_SUBJECTS, getSubjectGroups } from "./academicCatalog";
import { DEMO_SCHEDULE_SLOTS } from "./scheduleSlots";

export const DEMO_STUDENT_GROUP = "112-МКо";
export const DEMO_TEACHER = "Волкова Е.В.";

// Повторяемая демонстрационная неделя до подключения API вуза.
export const createDemoWeekSchedule = (date: Date): WeeklyScheduleData => {
  const monday = getWeekStart(date);
  const slotsByDay = [[0, 1, 2, 3], [0, 2, 3, 5], [0, 1, 2, 3, 4, 5, 6], [1, 2, 4], [0, 1, 2, 6]];
  return Array.from({ length: 5 }, (_, day) => {
    const lessonDate = new Date(monday);
    lessonDate.setDate(monday.getDate() + day);
    const dateKey = toLocalDateKey(lessonDate);
    const lessons: WeeklyScheduleData = slotsByDay[day].map((slot) => {
      const { startTime, endTime } = DEMO_SCHEDULE_SLOTS[slot];
      const subject = DEMO_SUBJECTS[(day + slot) % DEMO_SUBJECTS.length];
      return {
        id: Number(dateKey.replaceAll("-", "")) * 10 + slot,
        date: dateKey,
        dayOfWeek: day + 1,
        subject: subject.name,
        type: slot >= 4 ? "Лаб." : slot % 2 === 0 ? "Лек." : "Пр.",
        startTime,
        endTime,
        location: `Ауд. ${[101, 202, 303, 101, 405, 406, 407][slot]}`,
        teacher: slot === 1 ? "Петров П.П." : DEMO_TEACHER,
        teacherId: slot === 1 ? "teacher-pavel-petrov" : "teacher-elena-volkova",
        group: slot >= 3 ? getSubjectGroups(subject.id).find((group) => group.name !== DEMO_STUDENT_GROUP)?.name ?? DEMO_STUDENT_GROUP : DEMO_STUDENT_GROUP,
      };
    });
    // A parallel class keeps the student's lesson with another teacher visible,
    // while the teacher has a full seven-slot day without overlapping own classes.
    if (day === 2) {
      const subject = DEMO_SUBJECTS[(day + 1) % DEMO_SUBJECTS.length];
      const { startTime, endTime } = DEMO_SCHEDULE_SLOTS[1];
      lessons.push({
        id: Number(dateKey.replaceAll("-", "")) * 10 + 7,
        date: dateKey, dayOfWeek: day + 1, subject: subject.name, type: "Пр.",
        startTime, endTime, location: "Ауд. 405", teacher: DEMO_TEACHER,
        teacherId: "teacher-elena-volkova",
        group: getSubjectGroups(subject.id).find((group) => group.name !== DEMO_STUDENT_GROUP)?.name ?? DEMO_STUDENT_GROUP,
      });
    }
    return lessons.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id - b.id);
  }).flat();
};
