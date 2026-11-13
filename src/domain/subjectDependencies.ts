import type { PortalAccount } from "./accounts";
import type { AssessmentDocument } from "./assessmentTypes";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import type { SubjectDependencies } from "./subjectCatalog";

export function getSubjectDependencies(subjectId: string, accounts: readonly PortalAccount[], schedule: ManagedScheduleSnapshot, assessments: AssessmentDocument, now: number): SubjectDependencies {
  const activeCorrections = new Set(assessments.corrections.filter(row => row.state === "draft").map(row => row.assessmentId));
  return {
    teachingAssignments: accounts.filter(account => account.role === "teacher" && account.memberships.some(row => row.subjectId === subjectId && row.groupIds.length > 0)).length,
    draftLessons: schedule.drafts.reduce((count, week) => count + week.lessons.filter(row => row.subjectId === subjectId).length, 0),
    futurePublishedLessons: schedule.published.reduce((count, week) => count + week.lessons.filter(row => row.subjectId === subjectId && Date.parse(`${row.date}T${row.endsAt}:00+03:00`) > now).length, 0),
    unfinishedAssessments: assessments.assessments.filter(row => row.subjectId === subjectId && (row.attempts.some(attempt => attempt.state === "draft") || activeCorrections.has(row.id))).length,
  };
}
