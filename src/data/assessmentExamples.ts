import { isSupervisedAssessment, type Assessment, type AssessmentAttempt, type AssessmentKind, type AssessmentOutcome } from "../domain/assessmentTypes";

const teachers = [
  { id: "example-teacher-ivanov", name: "Иванов Иван Иванович" },
  { id: "example-teacher-petrova", name: "Петрова Анна Сергеевна" },
  { id: "example-teacher-sokolov", name: "Соколов Дмитрий Андреевич" },
  { id: "example-teacher-volkova", name: "Волкова Елена Викторовна" },
];
const subjects = [
  ["Математический анализ", "Линейная алгебра", "Основы программирования", "История России", "Иностранный язык", "Культура научной речи"],
  ["Теория вероятностей", "Дискретная математика", "Объектно-ориентированное программирование", "Философия", "Физическая культура", "Введение в анализ данных"],
  ["Математическая статистика", "Базы данных", "Алгоритмы и структуры данных", "Экономика", "Иностранный язык", "Разработка мобильных приложений"],
  ["Анализ данных", "Информационная безопасность", "Проектирование информационных систем", "Правоведение", "Управление проектами", "Машинное обучение"],
];
const dayOffset = (value: string, days: number) => new Date(Date.parse(`${value}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Isolated read-only examples: no localStorage, real account changes or implicit insertion into statements. */
export const createAssessmentExamples = (studentId: string) => {
  const assessments: Assessment[] = [];
  const add = (semester: number, index: number, title: string, kind: AssessmentKind, hours: number, elective = false) => {
    const course = Math.ceil(semester / 2);
    const year = 2022 + course;
    const date = `${year}-${semester % 2 ? "01" : "06"}-${String(10 + index).padStart(2, "0")}`;
    const id = `example-assessment-${semester}-${index}`;
    const teacherId = teachers[index % teachers.length].id;
    const outcome: AssessmentOutcome = kind === "pass" ? { status: "passed" } : { status: "graded", grade: ([3, 4, 5] as const)[(semester + index) % 3] };
    const attempts: AssessmentAttempt[] = [];
    const addAttempt = (number: number, attemptKind: AssessmentAttempt["kind"], result: AssessmentOutcome) => {
      const attemptDate = dayOffset(date, (number - 1) * 7);
      attempts.push({ id: `${id}-attempt-${number}`, number, kind: attemptKind, date: attemptDate, startsAt: "12:40", teacherId,
        chairId: attemptKind === "commission" ? teachers[2].id : null, memberIds: attemptKind === "commission" ? [teachers[1].id, teachers[3].id] : [],
        studentIds: [studentId], results: [{ studentId, outcome: result }], state: "published", createdAt: `${dayOffset(attemptDate, -1)}T09:00:00.000Z`, createdBy: "example-configurator",
        publishedAt: `${attemptDate}T11:00:00.000Z`, publishedBy: teacherId });
    };
    if (semester === 1 && index === 0) { addAttempt(1, "primary", { status: "graded", grade: 2 }); addAttempt(2, "retake", { status: "graded", grade: 4 }); }
    else if (semester === 3 && index === 2) { addAttempt(1, "primary", { status: "absent" }); addAttempt(2, "retake", { status: "graded", grade: 2 }); addAttempt(3, "commission", { status: "graded", grade: 4 }); }
    else if (semester === 4 && kind === "pass") { addAttempt(1, "primary", { status: "failed" }); addAttempt(2, "retake", { status: "passed" }); }
    else addAttempt(1, "primary", outcome);
    assessments.push({ id, title, kind, subjectId: `example-subject-${semester}-${index}`, subjectName: title,
      groupId: "example-group", groupName: "Учебная демо-группа", period: `${course} курс · ${year - 1}/${year}`, supervisorId: isSupervisedAssessment(kind) ? teacherId : null,
      recordBook: { semester, hours, category: elective ? "elective" : "required" }, roster: [{ studentId, name: "Демонстрационный студент", studentNumber: null }], attempts });
  };
  for (let semester = 1; semester <= 8; semester++) {
    const titles = subjects[Math.floor((semester - 1) / 2)];
    titles.forEach((title, index) => add(semester, index, title, index < 3 ? "exam" : index === 3 || index === 5 && semester % 2 === 0 ? "gradedPass" : "pass", [72, 108, 144, 36, 72, 24][index], index === 5));
    if (semester % 2 === 0 && semester < 8) add(semester, 6, semester === 2 ? "Учебная практика" : "Производственная практика", "internship", semester === 2 ? 108 : 216);
    if ([3, 5, 7].includes(semester)) add(semester, 7, `Курсовая работа: ${titles[2]}`, "coursework", 36);
    if (semester === 8) { add(semester, 6, "Преддипломная практика", "internship", 216); add(semester, 8, "ВКР: Разработка образовательного портала", "thesis", 432); }
  }
  return { assessments, teachers: teachers.map((teacher) => ({ ...teacher })) };
};
