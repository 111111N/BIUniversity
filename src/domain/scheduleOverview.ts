import { isAcademicCalendarDate } from "./academicPeriods";
import { getScheduleRoomKey, type ManagedLesson, type ManagedScheduleSnapshot } from "./scheduleManagement";
import { matchesSearchText } from "./search";
import { formatLessonRoom, lessonRoomFilterKey } from "./rooms";

export interface ScheduleOverviewQuery { q: string; teacher: string; group: string; room: string; from: string; to: string; page: number }
export interface ScheduleOverviewRow extends ManagedLesson { subjectName: string; groupName: string }
export interface ScheduleOverviewLabels { subjects: Map<string, string>; groups: Map<string, string>; teachers: Map<string, string> }
export const queryScheduleOverview = (snapshot: ManagedScheduleSnapshot, labels: ScheduleOverviewLabels, query: ScheduleOverviewQuery) => {
  const lessons = snapshot.published.flatMap(week => week.lessons), teacherOptions = new Map<string, string>(), roomOptions = new Map<string, string>(), groupOptions = new Map<string, string>();
  for (const lesson of lessons) {
    teacherOptions.set(lesson.teacherId, labels.teachers.get(lesson.teacherId) ?? lesson.teacherName);
    groupOptions.set(lesson.groupId, labels.groups.get(lesson.groupId) ?? "Группа недоступна");
    const roomKey = lessonRoomFilterKey(lesson);
    if (roomKey) roomOptions.set(roomKey, `${formatLessonRoom(lesson)}${lesson.roomId ? "" : " · прежнее название"}`);
  }
  const options = (map: Map<string, string>) => [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ru", { numeric: true }) || a.value.localeCompare(b.value));
  let queryError = "";
  if (!isAcademicCalendarDate(query.from) || !isAcademicCalendarDate(query.to) || query.from > query.to) queryError = "Укажите корректный диапазон дат: окончание не раньше начала.";
  else if (typeof query.q !== "string" || query.q.length > 256) queryError = "Поисковый запрос должен содержать не более 256 символов.";
  else if (query.teacher !== "all" && !teacherOptions.has(query.teacher)) queryError = "Преподаватель из ссылки отсутствует в сохранённых публикациях. Выберите другой фильтр.";
  else if (query.group !== "all" && !groupOptions.has(query.group)) queryError = "Группа из ссылки отсутствует в сохранённых публикациях. Выберите другой фильтр.";
  else if (query.room !== "all" && !roomOptions.has(query.room)) queryError = "Аудитория из ссылки отсутствует в сохранённых публикациях. Выберите другой фильтр.";
  else if (!Number.isSafeInteger(query.page) || query.page < 1) queryError = "Номер страницы некорректен. Сбросьте фильтры или выберите первую страницу.";
  const rows: ScheduleOverviewRow[] = queryError ? [] : lessons.filter(lesson => lesson.date >= query.from && lesson.date <= query.to && (query.teacher === "all" || query.teacher === lesson.teacherId) && (query.group === "all" || query.group === lesson.groupId) && (query.room === "all" || query.room === lessonRoomFilterKey(lesson)) && matchesSearchText([labels.subjects.get(lesson.subjectId) ?? "", labels.groups.get(lesson.groupId) ?? "", labels.teachers.get(lesson.teacherId) ?? "", lesson.teacherName, formatLessonRoom(lesson)].join(" "), query.q))
    .map(lesson => ({ ...lesson, subjectName: labels.subjects.get(lesson.subjectId) ?? "Дисциплина недоступна", groupName: labels.groups.get(lesson.groupId) ?? "Группа недоступна" }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt) || a.groupName.localeCompare(b.groupName, "ru", { numeric: true }) || a.id.localeCompare(b.id));
  const unresolved = rows.some(lesson => !labels.groups.has(lesson.groupId) || !labels.subjects.has(lesson.subjectId) || !labels.teachers.has(lesson.teacherId) || !getScheduleRoomKey(lesson.room));
  const pages = Math.max(1, Math.ceil(rows.length / 20)), page = queryError ? 1 : Math.min(query.page, pages);
  return { rows: rows.slice((page - 1) * 20, page * 20), total: queryError ? null : rows.length, groups: queryError ? null : new Set(rows.map(row => row.groupId)).size, page, pages, queryError,
    teachers: options(teacherOptions), rooms: options(roomOptions), groupOptions: options(groupOptions), warning: unresolved ? "Часть справочных связей публикаций недоступна. Сохранённые пары показаны без подстановки других учёток или групп." : "" };
};
