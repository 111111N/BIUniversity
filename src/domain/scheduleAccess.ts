import type { CurrentUser } from "../components/RoleContext";
import type { ScheduleItem } from "../types/sched";
import { isAcademicMembershipMatch } from "../data/academicCatalog";

/** Поиск расписания не расширяет доступ к журналам и заданиям. */
export const canOpenScheduleLesson = (item: ScheduleItem, user: CurrentUser) => {
  if (!item.group || !isAcademicMembershipMatch(user.memberships, item.subject, item.group)) return false;
  if (user.role === "student") return true;
  // ID имеет приоритет: совпадение имени не должно открывать пару другого преподавателя.
  if (item.teacherId) return item.teacherId === user.id;
  return Boolean(user.scheduleName && item.teacher?.trim() === user.scheduleName.trim());
};
