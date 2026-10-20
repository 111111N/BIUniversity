import type { DashboardMembership } from "../domain/dashboard";
import type { AnalyticsJournal } from "../domain/teacherAnalytics";
import { getAcademicGroup, getAcademicSubjectDefinition } from "./academicCatalog";
import { decodeJournal, getJournalSnapshot, journalKey } from "./journalStore";
import { createSubjectLessons } from "./lessons";

/** Read-only adapter. Damaged saved journals must not masquerade as demo statistics. */
export const readAnalyticsJournals = (memberships: DashboardMembership[]) => {
  const journals: AnalyticsJournal[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  memberships.forEach((membership) => membership.groupIds.forEach((groupId) => {
    const subject = getAcademicSubjectDefinition(membership.subjectId);
    const group = getAcademicGroup(groupId);
    const key = `${membership.subjectId}:${groupId}`;
    if (!subject || !group || seen.has(key)) return;
    seen.add(key);
    try {
      const raw = localStorage.getItem(journalKey(subject.id, group.id));
      if (raw !== null && decodeJournal(raw) === null) { warnings.push(`${subject.shortName} · ${group.name}`); return; }
      journals.push({ subjectId: subject.id, subjectName: subject.name, subjectShortName: subject.shortName, groupId: group.id, groupName: group.name, students: getJournalSnapshot(subject.id, group.id), lessons: createSubjectLessons(subject.id, group.id) });
    } catch { warnings.push(`${subject.shortName} · ${group.name}`); }
  }));
  return { journals, warnings };
};
