import { INITIAL_STUDENTS } from "../components/Attendance/data/students";
import { ACADEMIC_GROUPS, getAcademicGroup, getAcademicGroupByName, SUBJECT_GROUP_OFFERINGS } from "./academicCatalog";
import { createDemoJournal } from "./journalStore";
import { readStudentGroupJournals } from "./studentProfileMetrics";
import { readAccountsState } from "./accountStore";
import { getStudentGroupId, type PortalAccount } from "../domain/accounts";

export interface StudentProfileData {
  id: string;
  initials: string;
  name: string;
  group: string;
  email: string;
  course: number;
  studentNumber?: string;
  campus?: number;
}

const initialsFor = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2);
const profileFor = (student: { id: string; name: string }, groupId: string, account?: PortalAccount): StudentProfileData => {
  const group = getAcademicGroup(groupId)!;
  const name = account && (account.createdAt || account.updatedAt) ? account.name : student.name;
  return {
    id: student.id, name, initials: initialsFor(name), group: group.name, course: group.course,
    email: account?.email ?? (student.id === "anna-smirnova" ? "a.smirnova@student.university.ru" : account ? "Почта не указана" : `student${student.id}@student.university.ru`),
    ...(account?.studentRecord ? { studentNumber: account.studentRecord.number, campus: account.studentRecord.campus } : {}),
  };
};

// Keep old contact IDs valid; their academic metrics require a matching journal entry.
export const RISK_STUDENTS: StudentProfileData[] = [
  { id: "risk-anna-kuznetsova", initials: "АК", name: "Анна Кузнецова", group: "112-МКо", email: "a.kuznetsova@student.university.ru", course: 2 },
  { id: "risk-maxim-sokolov", initials: "МС", name: "Максим Соколов", group: "211-ИВТ", email: "m.sokolov@student.university.ru", course: 2 },
  { id: "risk-denis-volkov", initials: "ДВ", name: "Денис Волков", group: "311-ПМИ", email: "d.volkov@student.university.ru", course: 3 },
  { id: "risk-elena-petrova", initials: "ЕП", name: "Елена Петрова", group: "113-МКо", email: "e.petrova@student.university.ru", course: 2 },
  { id: "risk-roman-ilin", initials: "РИ", name: "Роман Ильин", group: "412-БИ", email: "r.ilin@student.university.ru", course: 4 },
  { id: "risk-olga-belova", initials: "ОБ", name: "Ольга Белова", group: "111-ИС", email: "o.belova@student.university.ru", course: 1 },
];

const demoProfiles = ACADEMIC_GROUPS.flatMap((group) => {
  const offering = SUBJECT_GROUP_OFFERINGS.find((item) => item.groupId === group.id);
  return offering ? createDemoJournal(offering.subjectId, group.id).map((student) => profileFor(student, group.id)) : [];
});
export const STUDENT_PROFILES = [
  ...demoProfiles, ...RISK_STUDENTS,
  ...INITIAL_STUDENTS.map((student) => profileFor(student, "112-mko")),
];

export const getGroupStudentProfiles = (groupName: string) => {
  const group = getAcademicGroupByName(groupName);
  if (!group) return [];
  const { journals } = readStudentGroupJournals(group.id);
  const students = new Map(journals.flatMap((journal) => journal.students).map((student) => [student.id, student]));
  const accounts = new Map((typeof localStorage === "undefined" ? [] : readAccountsState().accounts).map((account) => [account.id, account]));
  for (const account of accounts.values()) if ((account.studentGroupId || account.createdAt) && getStudentGroupId(account) === group.id && !students.has(account.id)) students.set(account.id, { id: account.id, name: account.name, attendance: {}, grades: {} });
  return Array.from(students.values()).map((student) => profileFor(student, group.id, accounts.get(student.id)));
};

export const getStudentProfile = (id?: string, groupId?: string) => {
  if (!id) return undefined;
  const inferredGroup = ACADEMIC_GROUPS.find((group) => id.startsWith(`${group.id}-`));
  const known = STUDENT_PROFILES.find((student) => student.id === id);
  const account = typeof localStorage === "undefined" ? undefined : readAccountsState().accounts.find((entry) => entry.id === id && entry.role === "student");
  const group = groupId ? getAcademicGroup(groupId) : getAcademicGroup(account ? getStudentGroupId(account) : undefined) ?? inferredGroup ?? getAcademicGroupByName(known?.group);
  if (groupId && !group) return undefined;
  if (group) {
    const savedProfile = getGroupStudentProfiles(group.name).find((student) => student.id === id);
    return savedProfile ?? (known?.group === group.name ? known : undefined);
  }
  const matches = ACADEMIC_GROUPS.flatMap((candidate) => getGroupStudentProfiles(candidate.name).filter((student) => student.id === id));
  return matches.length === 1 ? matches[0] : undefined;
};
