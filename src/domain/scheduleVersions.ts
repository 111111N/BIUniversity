export interface ManagedScheduleVersions {
  scheduleRevision: number;
  accountsRevision: number;
  subjectRevision: number;
  groupRevision: number;
  calendarRevision?: number;
  teachingRevision?: number;
  roomsRevision?: number;
}
export const sameManagedScheduleVersions = (a: ManagedScheduleVersions, b: ManagedScheduleVersions) =>
  a.scheduleRevision === b.scheduleRevision && a.accountsRevision === b.accountsRevision && a.subjectRevision === b.subjectRevision && a.groupRevision === b.groupRevision && (a.calendarRevision ?? 0) === (b.calendarRevision ?? 0) && (a.teachingRevision ?? 0) === (b.teachingRevision ?? 0) && (a.roomsRevision ?? 0) === (b.roomsRevision ?? 0);
