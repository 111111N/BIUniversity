import type { GroupCurriculum } from "./curriculumTypes";
import type { GroupCalendar } from "./groupCalendarTypes";

export interface CurriculumBindingCalendarChange { groupId: string; protectedTermIds: ReadonlySet<string> }

/** Only previous semester/term pairs are protected; newly added terms do not acquire a new restriction. */
export const getCurriculumBindingCalendarChange = (groupId: string, previous: GroupCurriculum | null | undefined, planId: string, periods: readonly { semester: number; termId: string }[]): CurriculumBindingCalendarChange => {
  const protectedTermIds = new Set<string>();
  if (previous) {
    const retained = new Set(periods.map(entry => JSON.stringify([entry.semester, entry.termId])));
    for (const entry of previous.periods) if (previous.planId !== planId || !retained.has(JSON.stringify([entry.semester, entry.period.term.id]))) protectedTermIds.add(entry.period.term.id);
  }
  return { groupId, protectedTermIds };
};

export const calendarRestrictsCurriculumBinding = (calendar: GroupCalendar, change: CurriculumBindingCalendarChange): boolean =>
  calendar.state === "closed" && calendar.group.id === change.groupId && change.protectedTermIds.has(calendar.period.term.id);
