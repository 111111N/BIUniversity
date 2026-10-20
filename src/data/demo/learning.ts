import { addDays, startOfWeek } from "date-fns";
import type { Assignment, Submission, SubmissionAttempt, SubmissionStatus } from "../assignmentStore";
import type { PlannerNote } from "../plannerStore";
import { SUBJECTS, getAcademicGroup, getSubjectGroups } from "../academicCatalog";
import { getJournalSnapshot } from "../journalStore";
import { getDemoWeekSchedule } from "../schedule";

const PREFIX = "demo-expanded-v1";
const localDateTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const dateAt = (day: Date, hours: number, minutes = 0) => { const date = new Date(day); date.setHours(hours, minutes, 0, 0); return date; };

const TOPICS: Record<string, string[]> = {
  "theory-of-probability": ["События и комбинаторика", "Условная вероятность и формула Байеса", "Случайные величины", "Распределения и математическое ожидание", "Подготовка к контрольной", "Итоговый разбор задач"],
  "mathematical-statistics": ["Описательная статистика", "Доверительные интервалы", "Проверка статистических гипотез", "Корреляция и регрессия", "План статистического исследования", "Разбор типичных ошибок"],
  "data-analysis": ["Очистка исходных данных", "Разведочный анализ", "Визуализация показателей", "Сравнение моделей классификации", "Проект: анализ учебного датасета", "Обсуждение результатов проекта"],
  "discrete-mathematics": ["Множества и отношения", "Логические выражения", "Графы и поиск кратчайшего пути", "Деревья и остовные графы", "Комбинаторный практикум", "Разбор контрольной работы"],
};

export const createLearningDemo = (anchor: Date) => {
  const monday = startOfWeek(anchor, { weekStartsOn: 1 });
  const assignments: Assignment[] = [];
  const submissions: Submission[] = [];
  SUBJECTS.forEach((subject, subjectIndex) => {
    const primaryGroup = getAcademicGroup("112-mko");
    const extraGroup = getSubjectGroups(subject.id).find((group) => group.id !== "112-mko");
    const groups = [primaryGroup, extraGroup].filter((group) => group !== undefined);
    groups.forEach((group, groupIndex) => {
      const roster = getJournalSnapshot(subject.id, group.id);
      const count = groupIndex === 0 ? 6 : 2;
      for (let scenario = 0; scenario < count; scenario++) {
        const targetDay = addDays(monday, [-7, -7, 0, 2, 7, -14][scenario]);
        const scheduled = getDemoWeekSchedule(targetDay)
          .filter((lesson) => lesson.subject === subject.name && lesson.group === group.name && lesson.teacherId === "teacher-elena-volkova")
          .sort((a, b) => Math.abs(new Date(`${a.date}T${a.startTime}`).getTime() - targetDay.getTime()) - Math.abs(new Date(`${b.date}T${b.startTime}`).getTime() - targetDay.getTime()))[0];
        const lesson = scheduled ? new Date(`${scheduled.date}T${scheduled.startTime}`) : dateAt(targetDay, 10, 10);
        const deadline = dateAt(addDays(lesson, [4, 5, 6, 7, 7, 5][scenario]), 23, 59);
        const id = `${PREFIX}:${subject.id}:${group.id}:${scenario}`;
        const assignment: Assignment = {
          id, subjectId: subject.id, groupId: group.id, subject: subject.name, group: group.name,
          title: TOPICS[subject.id][scenario],
          description: `Демонстрационное задание по теме «${TOPICS[subject.id][scenario]}».\n\n1. Изучите основные определения и разберите пример из конспекта.\n2. Решите задания своего варианта, приведите ход решения и объясните результат.\n3. Сформулируйте краткий вывод. Можно приложить файл с расчётами.\n\nВариант определяется номером в списке группы. Вопросы по условию можно задать преподавателю.`,
          lessonDate: localDateTime(lesson), lessonType: scheduled?.type === "Лек." ? "Лекция" : scheduled?.type === "Лаб." ? "Лабораторная" : "Практика",
          deadline: localDateTime(deadline), status: scenario === 0 ? "closed" : scenario === 4 ? "draft" : scenario === 5 ? "archived" : "published",
          allowLateSubmissions: scenario === 1, createdAt: localDateTime(addDays(lesson, -5)), updatedAt: localDateTime(addDays(lesson, -4)),
        };
        assignments.push(assignment);
        if (scenario >= 3) continue;
        roster.slice(0, 4).forEach((student, studentIndex) => {
          const status: SubmissionStatus = scenario === 0 ? "graded" : scenario === 1 ? studentIndex % 2 ? "graded" : "revision" : "submitted";
          const sent = dateAt(scenario === 1 && studentIndex === 3 ? addDays(deadline, 1) : addDays(lesson, 1), 14 + studentIndex, 10);
          const attemptId = `${id}:${student.id}`;
          const makeAttempt = (number: number, state: SubmissionStatus, date: Date): SubmissionAttempt => ({
            id: `${attemptId}:attempt-${number}`, number, sentAt: date.toISOString(), updatedAt: dateAt(date, date.getHours(), 40).toISOString(),
            text: number === 1 ? `Вариант ${studentIndex + 1}. Выполнены расчёты по теме «${assignment.title}».\n\nПроверил исходные данные, записал формулы и получил результат. В последнем пункте привёл пояснение к решению.` : "Исправил решение по замечаниям: добавил обоснование выбора метода, проверку расчётов и итоговый вывод.",
            status: state, submittedLate: date.getTime() > deadline.getTime(),
            ...(state !== "submitted" ? { teacherComment: state === "revision" ? "Добавьте обоснование решения во втором пункте и проверьте вычисления. Итоговый результат нужно сопроводить выводом." : "Решение проверено. Основной ход рассуждений верный; замечания обсудим на занятии.", reviewedAt: dateAt(date, date.getHours(), 40).toISOString() } : {}),
            ...(state === "graded" ? { grade: String(5 - ((studentIndex + subjectIndex) % 4)) } : {}),
          });
          const attempts = scenario === 2 && studentIndex === 0 || scenario === 0 && studentIndex === 0
            ? [makeAttempt(1, "revision", sent), makeAttempt(2, status, dateAt(addDays(sent, 1), 16))]
            : [makeAttempt(1, status, sent)];
          const current = attempts[attempts.length - 1];
          submissions.push({ id: attemptId, assignmentId: id, studentId: student.id, studentName: student.name, sentAt: attempts[0].sentAt, updatedAt: current.updatedAt, text: current.text, status: current.status, grade: current.grade, teacherComment: current.teacherComment, attempts, attemptCount: attempts.length });
        });
      }
    });
  });
  return { assignments, submissions };
};

export const createPlannerDemo = (anchor: Date): PlannerNote[] => {
  const monday = startOfWeek(anchor, { weekStartsOn: 1 });
  const templates: Array<[number, string, string, PlannerNote["priority"], PlannerNote["category"], number?, number?]> = [
    [0, "Подготовить примеры к лекции", "Проверить формулы и добавить разбор задачи на условную вероятность.", "high", "study", 8, 9],
    [0, "Проверить ответы группы 112-МКо", "Начать с повторно отправленных работ. Отметить типичные ошибки.", "medium", "study", 16, 17],
    [1, "Обновить материалы группы", "Прикрепить конспект и сборник задач к следующей практике.", "medium", "study"],
    [2, "Консультация перед контрольной", "Разобрать доверительные интервалы и критерии проверки гипотез.", "high", "study", 15, 16],
    [2, "Записаться к врачу", "Уточнить свободное время после занятий.", "low", "personal"],
    [3, "Согласовать проектные темы", "Проверить, что у каждой команды есть исходные данные и критерии результата.", "medium", "study", 11, 12],
    [4, "Подвести итоги недели", "Заполнить пропущенные отметки, проверить очередь ответов и составить план следующей недели.", "high", "study", 17, 18],
    [4, "Подготовить длинный разбор для практики по графам", "Пример для проверки переноса длинного названия.\n\nДобавить рисунок графа, таблицу расстояний и пошаговый ход алгоритма.", "low", "study"],
    [5, "Прогулка и отдых", "Оставить время без рабочих задач.", "low", "personal", 12, 13],
    [5, "Подготовить занятия на следующую неделю", "Проверить аудитории и сроки заданий.", "medium", "study"],
    [6, "Разобрать личные заметки", "Выбрать важное, остальное перенести в архив.", "low", "personal"],
    [6, "Вечерняя подготовка презентации", "Пример задачи, которая заканчивается после полуночи.", "medium", "study", 23, 1],
    [7, "Опубликовать новый практикум", "Проверить описание и дедлайн в предпросмотре.", "high", "study", 9, 10],
    [8, "Собрать обратную связь от группы", "Спросить, какие темы нужно разобрать повторно.", "medium", "study"],
  ];
  return templates.map(([offset, title, text, priority, category, start, end], index) => {
    const day = addDays(monday, offset);
    return { id: `${PREFIX}:planner:${index}`, title, text, priority, category, completed: [0, 2, 4].includes(index), createdAt: dateAt(day, 0), ...(start !== undefined ? { startAt: dateAt(day, start) } : {}), ...(end !== undefined ? { endAt: dateAt(addDays(day, start !== undefined && end < start ? 1 : 0), end) } : {}) };
  });
};
