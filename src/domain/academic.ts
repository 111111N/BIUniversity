export type LessonType = "lecture" | "practice" | "laboratory";
export type LessonState = "scheduled" | "completed" | "cancelled" | "rescheduled";

export const isPerformanceLesson = (lesson: Pick<AcademicLesson, "type">) =>
  lesson.type === "practice" || lesson.type === "laboratory";

export type AcademicLesson = {
  id: string;
  subjectId: string;
  groupId: string;
  semesterId: string;
  date: string;
  startsAt: string;
  type: LessonType;
  topic: string;
  room: string;
  state: LessonState;
};

export const lessonTypeLabels: Record<LessonType, string> = {
  lecture: "Лекция",
  practice: "Практика",
  laboratory: "Лабораторная",
};
