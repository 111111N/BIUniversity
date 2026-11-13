import { ASSESSMENT_KIND_LABELS, ATTEMPT_KIND_LABELS, assessmentOutcomeLabel, type AssessmentDocument, type AssessmentStatementFile, type AssessmentStatementRequest } from "./assessmentTypes";
import { requireAssessmentActor, type AssessmentDomainContext } from "./assessments";
import { createCsv, type CsvCell } from "./csv";
import { assessmentPublication } from "./assessmentCorrections";

const moscowPublicationDate = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
}).format(new Date(value));

/** Receives a decoded document; authorization and formatting remain independent of browser downloads. */
export const createAssessmentStatement = (state: AssessmentDocument, request: AssessmentStatementRequest, context: AssessmentDomainContext): AssessmentStatementFile => {
  const actor = requireAssessmentActor(state, request, context);
  if (actor.role !== "configurator" && actor.role !== "teacher") throw new Error("Скачивать ведомости могут настройщик и назначенный преподаватель.");
  const assessment = state.assessments.find((entry) => entry.id === request.assessmentId);
  const attempt = assessment?.attempts.find((entry) => entry.id === request.attemptId);
  if (!assessment || !attempt || actor.role === "teacher" && attempt.teacherId !== actor.id) throw new Error("Ведомость недоступна для скачивания.");
  if (attempt.state !== "published" || !attempt.publishedAt) throw new Error("Скачать можно только опубликованную ведомость.");
  const publication = assessmentPublication(state, attempt, request.version);
  const roster = new Map(assessment.roster.map((student) => [student.studentId, student]));
  const results = new Map(publication.results.map((result) => [result.studentId, result.outcome]));
  if (!attempt.studentIds.length || new Set(attempt.studentIds).size !== attempt.studentIds.length || results.size !== attempt.studentIds.length || results.size !== attempt.results.length) throw new Error("Состав и результаты ведомости не согласованы. Обновите данные.");
  const accounts = new Map(context.accounts.map((account) => [account.id, account.name]));
  const teacherName = (id: string) => accounts.get(id) ?? `Имя недоступно (ID: ${id})`;
  const metadata: CsvCell[] = [
    assessment.title, ASSESSMENT_KIND_LABELS[assessment.kind], assessment.subjectName, assessment.groupName, assessment.period,
    assessment.recordBook?.semester, assessment.recordBook?.hours,
    assessment.recordBook ? assessment.recordBook.category === "elective" ? "Факультатив" : "Обязательная дисциплина" : "",
    ATTEMPT_KIND_LABELS[attempt.kind], attempt.number,
    `${attempt.date.slice(8, 10)}.${attempt.date.slice(5, 7)}.${attempt.date.slice(0, 4)}`, attempt.startsAt, attempt.room,
    teacherName(attempt.teacherId), attempt.chairId ? teacherName(attempt.chairId) : "", attempt.memberIds.map(teacherName).join("; "),
    moscowPublicationDate(publication.publishedAt!), assessment.id, attempt.id,
  ];
  const rows = attempt.studentIds.map((studentId, index): CsvCell[] => {
    const student = roster.get(studentId);
    const outcome = results.get(studentId);
    if (!student || !outcome) throw new Error("В опубликованной ведомости не хватает участника или результата. Обновите данные.");
    const period = assessment.academicPeriod;
    return [index + 1, student.name, student.studentNumber, outcome.status === "graded" ? outcome.grade : assessmentOutcomeLabel(outcome), ...metadata, studentId,
      ...(period ? [period.year.id, period.year.name, period.year.startsOn, period.year.endsOn, period.year.revision, period.term.id, period.term.name, period.term.startsOn, period.term.endsOn, period.term.revision, period.catalogRevision] : [])];
  });
  const header = ["№", "ФИО студента", "Номер зачётки", "Результат", "Аттестация", "Форма контроля", "Дисциплина", "Группа", "Учебный период", "Семестр", "Часы", "Раздел", "Вид попытки", "Номер попытки", "Дата сдачи", "Время сдачи (Москва)", "Аудитория", "Преподаватель / научный руководитель", "Председатель комиссии", "Члены комиссии", "Опубликовано (Москва)", "ID аттестации", "ID попытки", "ID студента"];
  if (assessment.academicPeriod) header.push("ID учебного года", "Учебный год", "Начало года", "Окончание года", "Ревизия года", "ID учебного семестра", "Учебный семестр", "Начало семестра", "Окончание семестра", "Ревизия семестра", "Ревизия справочника периодов");
  const filenameId = assessment.id.replace(/[^\p{L}\p{N}._-]/gu, "_").slice(0, 100);
  return { filename: `assessment-${filenameId}-${attempt.number}-${attempt.date}${publication.version > 1 || request.version !== undefined ? `-v${publication.version}` : ""}.csv`, csv: createCsv([header, ...rows]) };
};
