import { sameTeachingData, type TeachingAssignment } from "./teachingAssignments";
import type { GroupCalendar } from "./groupCalendarTypes";

export interface TeachingCalendarChange { groupId: string; modeChanged: boolean; changedTermIds: ReadonlySet<string> }

export const getTeachingCalendarChange = (before: TeachingAssignment | null | undefined, after: TeachingAssignment): TeachingCalendarChange => {
  const previous = new Map((before?.periods ?? []).map(entry => [entry.period.term.id, entry]));
  const next = new Map(after.periods.map(entry => [entry.period.term.id, entry]));
  const changedTermIds = new Set<string>();
  for (const termId of new Set([...previous.keys(), ...next.keys()])) if (!sameTeachingData(previous.get(termId), next.get(termId))) changedTermIds.add(termId);
  return { groupId: after.groupId, modeChanged: (before?.mode ?? "general") !== after.mode, changedTermIds };
};

export const calendarRestrictsTeachingChange = (calendar: GroupCalendar, change: TeachingCalendarChange): boolean =>
  calendar.group.id === change.groupId && calendar.state === "closed" && (change.modeChanged || change.changedTermIds.has(calendar.period.term.id));
