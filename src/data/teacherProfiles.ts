import { SUBJECTS } from "./academicCatalog";
import { STUDY_PLAN_TOTAL_HOURS } from "./studyPlan";

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
    email: "e.volkova@university.ru", subjects: SUBJECTS.map((subject) => subject.name),
    groups: 10, workload: STUDY_PLAN_TOTAL_HOURS,
  },
  { id: "teacher-orlova", initials: "НО", name: "Наталья Орлова", department: "Кафедра информатики", position: "Доцент", email: "n.orlova@university.ru", subjects: ["Информатика", "Алгоритмы"], groups: 5, workload: 312 },
  { id: "teacher-mironov", initials: "АМ", name: "Андрей Миронов", department: "Кафедра математики", position: "Старший преподаватель", email: "a.mironov@university.ru", subjects: ["Математический анализ", "Линейная алгебра"], groups: 4, workload: 286 },
  { id: "teacher-belova", initials: "ЕБ", name: "Екатерина Белова", department: "Учебная часть", position: "Методист", email: "e.belova@university.ru", subjects: ["Организация учебного процесса"], groups: 7, workload: 244 },
];

export const getTeacherProfile = (id?: string) => TEACHER_PROFILES.find((teacher) => teacher.id === id);
