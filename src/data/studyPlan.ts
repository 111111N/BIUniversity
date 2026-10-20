export type StudyPlanControl = "Экзамен" | "Зачёт" | "Дифференцированный зачёт";
export type StudyPlanSubject = { id: string; name: string; semester: 3 | 4; lectures: number; practice: number; labs: number; independent: number; control: StudyPlanControl; teacher: string; hasProgram: boolean };

export const STUDY_PLAN: StudyPlanSubject[] = [
  { id: "theory-of-probability", name: "Теория вероятностей", semester: 3, lectures: 24, practice: 20, labs: 0, independent: 28, control: "Экзамен", teacher: "Елена Волкова", hasProgram: true },
  { id: "mathematical-statistics", name: "Математическая статистика", semester: 3, lectures: 18, practice: 18, labs: 0, independent: 18, control: "Зачёт", teacher: "Елена Волкова", hasProgram: true },
  { id: "data-analysis", name: "Анализ данных", semester: 3, lectures: 24, practice: 18, labs: 30, independent: 36, control: "Экзамен", teacher: "Елена Волкова", hasProgram: true },
  { id: "discrete-mathematics", name: "Дискретная математика", semester: 3, lectures: 28, practice: 26, labs: 0, independent: 36, control: "Экзамен", teacher: "Елена Волкова", hasProgram: true },
  { id: "algorithms", name: "Алгоритмы и структуры данных", semester: 4, lectures: 24, practice: 12, labs: 36, independent: 36, control: "Экзамен", teacher: "Марина Орлова", hasProgram: true },
  { id: "databases", name: "Базы данных", semester: 4, lectures: 20, practice: 10, labs: 24, independent: 36, control: "Дифференцированный зачёт", teacher: "Сергей Волков", hasProgram: true },
  { id: "numerical-methods", name: "Численные методы", semester: 4, lectures: 20, practice: 24, labs: 10, independent: 36, control: "Экзамен", teacher: "Елена Крылова", hasProgram: false },
  { id: "academic-english", name: "Академический английский", semester: 4, lectures: 0, practice: 36, labs: 0, independent: 18, control: "Зачёт", teacher: "Ирина Соколова", hasProgram: true },
];

export const getSubjectHours = (subject: StudyPlanSubject) => subject.lectures + subject.practice + subject.labs + subject.independent;
export const getSemesterSubjects = (semester: number) => STUDY_PLAN.filter((subject) => subject.semester === semester);
export const getSemesterHours = (semester: number) => getSemesterSubjects(semester).reduce((total, subject) => total + getSubjectHours(subject), 0);
export const STUDY_PLAN_TOTAL_HOURS = getSemesterHours(3);
