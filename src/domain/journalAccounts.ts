import type { Student } from "../components/Attendance/data/students";
import type { CurrentUser } from "./accounts";

/** Account creation supplies roster identity, never historical marks. Existing records remain intact. */
export const includeRegisteredJournalStudents = (students: Student[], accounts: CurrentUser[], subjectId: string, groupId: string, preservedRosterIds: ReadonlySet<string> = new Set()): Student[] => {
  const knownIds = new Set(students.map((student) => student.id));
  const added = accounts.filter((account) => account.role === "student" && !knownIds.has(account.id) && !preservedRosterIds.has(account.id)
    && account.memberships.some((membership) => membership.subjectId === subjectId && membership.groupIds.includes(groupId)))
    .map((account) => ({ id: account.id, name: account.name, attendance: {}, grades: {} }));
  return added.length ? [...students, ...added] : students;
};
