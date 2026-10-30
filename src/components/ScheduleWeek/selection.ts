import type { ScheduleItem } from "../../types/sched";
import type { CurrentUser } from "../../domain/accounts";
import { getWeekStart, toLocalDateKey } from "../../domain/schedule";

export const scheduleWorkspaceKey = (week: Date, user: Pick<CurrentUser, "id" | "role">, context = "") =>
  JSON.stringify([toLocalDateKey(getWeekStart(week)), user.role, user.id, context]);

export interface ScheduleLessonSelection { id: number; scopeKey: string }

/** Resolve against the current visible list; never retain a captured lesson or choose between duplicate IDs. */
export const currentScheduleSelection = (lessons: readonly ScheduleItem[], selection: ScheduleLessonSelection | null, scopeKey: string) => {
  if (!selection || selection.scopeKey !== scopeKey) return null;
  let selected: ScheduleItem | null = null;
  for (const lesson of lessons) {
    if (lesson.id !== selection.id) continue;
    if (selected) return null;
    selected = lesson;
  }
  return selected;
};
