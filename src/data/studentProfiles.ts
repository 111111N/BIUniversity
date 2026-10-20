import { INITIAL_STUDENTS } from "../components/Attendance/data/students";

export interface StudentProfileData { id: string; initials: string; name: string; group: string; email: string; course: number; averageGrade: number; attendance: number; completedWorks: number; totalWorks: number; note?: string; risk?: "Высокий" | "Средний"; }

const RISK_PROFILES: StudentProfileData[] = [
  { id: "risk-anna-kuznetsova", initials: "АК", name: "Анна Кузнецова", group: "112-МКо", email: "a.kuznetsova@student.university.ru", course: 2, averageGrade: 2.8, attendance: 52, completedWorks: 5, totalWorks: 9, note: "Посещаемость 52% · средний балл 2,8", risk: "Высокий" },
  { id: "risk-maxim-sokolov", initials: "МС", name: "Максим Соколов", group: "211-ИВТ", email: "m.sokolov@student.university.ru", course: 2, averageGrade: 3.1, attendance: 61, completedWorks: 4, totalWorks: 9, note: "3 пропуска подряд · нет работ", risk: "Высокий" },
  { id: "risk-denis-volkov", initials: "ДВ", name: "Денис Волков", group: "311-ПМИ", email: "d.volkov@student.university.ru", course: 3, averageGrade: 3.6, attendance: 78, completedWorks: 7, totalWorks: 9, note: "Средний балл снизился на 0,7", risk: "Средний" },
  { id: "risk-elena-petrova", initials: "ЕП", name: "Елена Петрова", group: "113-МКо", email: "e.petrova@student.university.ru", course: 2, averageGrade: 3.7, attendance: 81, completedWorks: 6, totalWorks: 9, note: "Не сданы две практические работы", risk: "Средний" },
  { id: "risk-roman-ilin", initials: "РИ", name: "Роман Ильин", group: "412-БИ", email: "r.ilin@student.university.ru", course: 4, averageGrade: 3.9, attendance: 64, completedWorks: 8, totalWorks: 9, note: "Посещаемость ниже 65%", risk: "Средний" },
  { id: "risk-olga-belova", initials: "ОБ", name: "Ольга Белова", group: "111-ИС", email: "o.belova@student.university.ru", course: 1, averageGrade: 3.4, attendance: 69, completedWorks: 5, totalWorks: 9, note: "Нет оценок за последний месяц", risk: "Высокий" },
];
const initialsFor = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2);
const JOURNAL_PROFILES: StudentProfileData[] = INITIAL_STUDENTS.map((student, index) => ({ id: student.id, initials: initialsFor(student.name), name: student.name, group: "112-МКо", email: `student${student.id}@student.university.ru`, course: 2, averageGrade: Number((3.4 + (index % 13) / 10).toFixed(1)), attendance: 72 + (index % 23), completedWorks: 6 + (index % 4), totalWorks: 9 }));
const CURRENT_STUDENT_PROFILE: StudentProfileData = { id: "anna-smirnova", initials: "АС", name: "Анна Смирнова", group: "112-МКо", email: "a.smirnova@student.university.ru", course: 2, averageGrade: 4, attendance: 84, completedWorks: 7, totalWorks: 9 };
export const STUDENT_PROFILES = [CURRENT_STUDENT_PROFILE, ...RISK_PROFILES, ...JOURNAL_PROFILES];
export const RISK_STUDENTS = RISK_PROFILES;
export const getStudentProfile = (id?: string) => STUDENT_PROFILES.find((student) => student.id === id);
export const getGroupStudentProfiles = (group: string) => STUDENT_PROFILES.filter((student) => student.group === group);
