import { registerAccountRoleChangeGuard, registerTeachingAssignmentGuard } from "./accountStore";
import { hasFuturePublishedTeaching, readManagedScheduleState } from "./managedScheduleStore";

// Cross-module policy belongs to composition: neither domain depends on the other.
export const connectAdministrationPolicies = () => {
  const stopRoleGuard = registerAccountRoleChangeGuard((account, nextRole) => {
    if (account.role === "teacher" && nextRole !== "teacher" && hasFuturePublishedTeaching(account.id)) {
      throw new Error("У преподавателя остались будущие занятия в опубликованном расписании. Сначала замените преподавателя или отмените эти занятия и опубликуйте изменения.");
    }
  });
  const stopAssignmentGuard = registerTeachingAssignmentGuard((account, memberships) => {
    const state = readManagedScheduleState();
    if (state.error) throw new Error("Проверка назначенных занятий недоступна: восстановите расписание.");
    const now = Date.now();
    const removed = state.snapshot.published.some((week) => week.lessons.some((lesson) => lesson.teacherId === account.id
      && new Date(`${lesson.date}T${lesson.endsAt}`).getTime() > now
      && !memberships.some((membership) => membership.subjectId === lesson.subjectId && membership.groupIds.includes(lesson.groupId))));
    if (removed) throw new Error("Нельзя снять назначение: у преподавателя есть будущие опубликованные пары для этих групп. Сначала замените преподавателя или отмените пары.");
  });
  return () => { stopRoleGuard(); stopAssignmentGuard(); };
};
