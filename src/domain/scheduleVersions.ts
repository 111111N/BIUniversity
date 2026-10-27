export interface ManagedScheduleVersions {
  scheduleRevision: number;
  accountsRevision: number;
  subjectRevision: number;
  groupRevision: number;
}
export const sameManagedScheduleVersions = (a: ManagedScheduleVersions, b: ManagedScheduleVersions) =>
  a.scheduleRevision === b.scheduleRevision && a.accountsRevision === b.accountsRevision && a.subjectRevision === b.subjectRevision && a.groupRevision === b.groupRevision;
