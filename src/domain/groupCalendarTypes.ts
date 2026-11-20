import type { AssessmentAcademicPeriod } from "./assessmentTypes";

export const GROUP_CALENDARS_KEY = "bi-university-group-calendars-v1";
export const CALENDAR_PHASES = { teaching: "Обучение", session: "Сессия", practice: "Практика", vacation: "Каникулы" } as const;
export interface CalendarSegment { id: string; kind: keyof typeof CALENDAR_PHASES; startsOn: string; endsOn: string }
export interface CalendarDayOff { id: string; date: string; name: string }
export interface CalendarContents { segments: CalendarSegment[]; daysOff: CalendarDayOff[] }
export interface GroupCalendar extends CalendarContents {
  id: string; revision: number; group: { id: string; name: string; revision: number };
  period: AssessmentAcademicPeriod; state: "open" | "closed";
}
export interface GroupCalendarEvent {
  id: string; actorId: string; occurredAt: string; action: "saved" | "copied" | "closed" | "reopened";
  before: GroupCalendar | null; after: GroupCalendar; reason: string;
  source: { calendarId: string; revision: number; offsetDays: number } | null;
}
export interface GroupCalendarsDocument { version: 1; revision: number; calendars: GroupCalendar[]; history: GroupCalendarEvent[] }
export interface GroupCalendarContext { actorId: string; actorRevision: number; expectedRevision: number; groupsRevision: number; periodsRevision: number }
export type GroupCalendarCommand = GroupCalendarContext & (
  | { type: "save"; groupId: string; termId: string; calendarRevision: number; contents: CalendarContents }
  | { type: "copy"; groupId: string; termId: string; calendarRevision: number; sourceId: string; sourceRevision: number }
  | { type: "close" | "reopen"; calendarId: string; calendarRevision: number; reason: string }
);
export const emptyGroupCalendars = (): GroupCalendarsDocument => ({ version: 1, revision: 0, calendars: [], history: [] });
