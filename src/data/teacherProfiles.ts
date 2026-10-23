import { DEMO_SUBJECTS, SUBJECTS } from "./academicCatalog";
import { STUDY_PLAN_TOTAL_HOURS } from "./studyPlan";
import { readAccountsState } from "./accountStore";

export interface TeacherProfileData {
  id: string;
  initials: string;
  name: string;
  department: string;
  position: string;
  email: string;
  subjects: string[];
  groups: number;
  workload: number;
}

export const TEACHER_PROFILES: TeacherProfileData[] = [
  {
    id: "teacher-elena-volkova", initials: "ЕВ", name: "Елена Волкова",
    department: "Кафедра прикладной математики", position: "Доцент",
    email: "e.volkova@university.ru", subjects: DEMO_SUBJECTS.map((subject) => subject.name),
    groups: 10, workload: STUDY_PLAN_TOTAL_HOURS,
  },
  { id: "teacher-orlova", initials: "НО", name: "Наталья Орлова", department: "Кафедра информатики", position: "Доцент", email: "n.orlova@university.ru", subjects: ["Информатика", "Алгоритмы"], groups: 5, workload: 312 },
  { id: "teacher-mironov", initials: "АМ", name: "Андрей Миронов", department: "Кафедра математики", position: "Старший преподаватель", email: "a.mironov@university.ru", subjects: ["Математический анализ", "Линейная алгебра"], groups: 4, workload: 286 },
  { id: "teacher-belova", initials: "ЕБ", name: "Екатерина Белова", department: "Учебная часть", position: "Методист", email: "e.belova@university.ru", subjects: ["Организация учебного процесса"], groups: 7, workload: 244 },
];

export const getTeacherProfile = (id?: string): TeacherProfileData | undefined => {
  const existing = TEACHER_PROFILES.find((teacher) => teacher.id === id);
  if (typeof localStorage === "undefined") return existing;
  const account = readAccountsState().accounts.find((item) => item.id === id);
  if (account && account.role !== "teacher") return undefined;
  if (!account) return existing;
  const subjects = account.memberships.map((entry) => SUBJECTS.find((subject) => subject.id === entry.subjectId)?.name ?? entry.subjectId);
  const groups = new Set(account.memberships.flatMap((entry) => entry.groupIds)).size;
  if (existing) return { ...existing, subjects, groups };
  return {
    id: account.id, name: account.name, initials: account.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join(""),
    department: "Подразделение не указано", position: "Преподаватель", email: "Не указана",
    subjects, groups, workload: 0,
  };
};
