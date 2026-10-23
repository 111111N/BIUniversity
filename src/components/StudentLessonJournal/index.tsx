import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { Student, AttendanceStatus } from "../Attendance/data/students";
import { isPerformanceLesson, lessonTypeLabels, type AcademicLesson } from "../../domain/academic";
import { getJournalMetrics } from "../../domain/journal";
import { getStudentJournalMonths, readStudentResultFilter, resolveStudentJournalMonth, selectStudentJournalLessons, selectStudentResults, type StudentResultFilter } from "../../domain/studentJournal";
import { formatCount } from "../../domain/formatCount";
import useJournalView from "../../hooks/useJournalView";
import Dropdown from "../Dropdown";
import ArrowCircle from "../ArrowCircle";
import LessonTypeFilter from "../LessonTypeFilter";
import JournalSummary from "../JournalSummary";
import { VisitMarkIcon } from "../ButtonIcons/Icons";
import styles from "./index.module.scss";

const attendanceLabels: Record<AttendanceStatus, string> = { present: "Присутствовал", sick: "Уважительная причина", absent: "Пропуск", unmarked: "Не отмечено" };
const attendanceColors: Record<AttendanceStatus, string> = { present: "var(--journal-present)", sick: "var(--journal-sick)", absent: "var(--journal-absent)", unmarked: "var(--ui-text-secondary)" };
const monthLabel = (month: string) => format(new Date(`${month}-01T12:00:00`), "LLLL yyyy", { locale: ru });
const resultFilters = [["all", "Все результаты"], ["unmarked", "Без отметки"], ["absent", "Пропуски"], ["low-grade", "Оценки 2–3"]] as const;
const GradePlaceholder = ({ label }: { label: string }) => <span className={styles.muted} title={label}><span className={styles.gradeExplanation}>{label}</span><span className={styles.gradeDash} aria-hidden="true">—</span></span>;

const LessonCard = ({ lesson, student }: { lesson: AcademicLesson; student: Student }) => {
  const date = new Date(`${lesson.date}T12:00:00`);
  const status = student.attendance[lesson.id] ?? "unmarked";
  const grade = student.grades[lesson.id];
  const planned = lesson.state === "scheduled";
  const attendance = planned && status === "unmarked" ? "Предстоит" : attendanceLabels[status];
  return <li className={styles.lesson} data-student-lesson={lesson.id}>
    <time className={styles.date} dateTime={`${lesson.date}T${lesson.startsAt}`}><strong>{format(date, "d MMM", { locale: ru })}</strong><span>{format(date, "EEEEEE", { locale: ru })} · {lesson.startsAt}</span></time>
    <div className={styles.content}><div className={styles.lessonMeta}><span className={styles.type}>{lessonTypeLabels[lesson.type]}</span><span className={styles.room}>Ауд. {lesson.room}{lesson.state === "cancelled" ? " · Отменено" : lesson.state === "rescheduled" ? " · Перенесено" : ""}</span></div><h3>{lesson.topic}</h3></div>
    <dl className={styles.results}>
      <div><dt>Посещаемость</dt><dd className={styles[status]}><span aria-hidden="true"><VisitMarkIcon size={22} color="var(--student-journal-surface)" color2={status === "absent" ? "var(--journal-outline)" : status === "present" ? "var(--journal-present-ring)" : attendanceColors[status]} fill={status === "present" || status === "absent" ? attendanceColors[status] : "transparent"} showInner={status !== "sick"} /></span>{attendance}</dd></div>
      <div><dt>Оценка</dt><dd>{isPerformanceLesson(lesson) ? grade != null ? <strong className={`${styles.grade} ${styles[`grade${grade}`]}`}>{grade}</strong> : <GradePlaceholder label={planned ? "Позже" : "Не выставлена"} /> : <GradePlaceholder label="Не предусмотрена" />}</dd></div>
    </dl>
  </li>;
};

export default function StudentLessonJournal({ student, lessons, now }: { student: Student; lessons: AcademicLesson[]; now: Date }) {
  const [params, setParams] = useSearchParams();
  const { lessonType, setLessonType } = useJournalView();
  const resultFilter = readStudentResultFilter(params);
  const changeResult = (value: StudentResultFilter) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value === "all") next.delete("result"); else next.set("result", value);
    return next;
  }, { replace: true });
  const months = getStudentJournalMonths(lessons);
  const month = resolveStudentJournalMonth(params.get("month"), months, now);
  const monthIndex = months.indexOf(month);
  const changeMonth = (value: string) => setParams((current) => { const next = new URLSearchParams(current); next.set("month", value); return next; }, { replace: true });
  const periodLessons = selectStudentJournalLessons(lessons, month, "all");
  const selected = selectStudentJournalLessons(lessons, month, lessonType);
  const completed = selected.filter((lesson) => lesson.state === "completed");
  const results = selectStudentResults(completed, student, resultFilter);
  const upcoming = selected.filter((lesson) => lesson.state !== "completed").reverse();
  const remaining = selected.filter((lesson) => lesson.state === "scheduled").length;
  const metrics = getJournalMetrics([student], completed.map((lesson) => lesson.id), completed.filter(isPerformanceLesson).map((lesson) => lesson.id));
  const period = month === "all" ? "Весь семестр" : monthLabel(month);
  return <div className={styles.journal}>
    <div className={styles.toolbar}>
      <div className={styles.period}><Dropdown label="Период" value={month} onChange={changeMonth} options={[{ value: "all", label: "Весь семестр" }, ...months.map((value) => ({ value, label: monthLabel(value) }))]} /><div className={styles.monthButtons}><button type="button" aria-label="Предыдущий месяц" disabled={monthIndex <= 0} onClick={() => changeMonth(months[monthIndex - 1])}><ArrowCircle direction="left" /></button><button type="button" aria-label="Следующий месяц" disabled={monthIndex < 0 || monthIndex >= months.length - 1} onClick={() => changeMonth(months[monthIndex + 1])}><ArrowCircle /></button></div></div>
      <LessonTypeFilter lessons={periodLessons} value={lessonType} onChange={setLessonType} />
    </div>
    <div className={styles.metrics} aria-label="Мои показатели за выбранный период">
      <div><span>Посещаемость</span><strong>{metrics.attendance === null ? "—" : `${Math.round(metrics.attendance)}%`}</strong><small>{metrics.marked ? "Среди отмеченных занятий" : "Отметок пока нет"}</small></div>
      <div><span>Средний балл</span><strong>{metrics.average?.toFixed(2) ?? "—"}</strong><small>{formatCount(metrics.gradesCount, ["оценка", "оценки", "оценок"])} · практики и лабораторные</small></div>
      <div><span>Проведено занятий</span><strong>{completed.length}</strong><small>{metrics.unmarked ? `Без отметки: ${metrics.unmarked}` : "По выбранному периоду и типу"}</small></div>
      <div data-student-metric="remaining"><span>Осталось занятий</span><strong>{remaining}</strong><small>Запланировано за выбранный период</small></div>
    </div>
    <div className={styles.listHeading}><h2>Мои результаты</h2><span role="status">{resultFilter === "all" ? formatCount(results.length, ["занятие", "занятия", "занятий"]) : `Показано ${results.length} из ${completed.length}`}</span></div>
    <div className={styles.resultFilters} role="group" aria-label="Срез результатов">{resultFilters.map(([value, label]) => <button key={value} type="button" aria-pressed={resultFilter === value} onClick={() => changeResult(value)}>{label}<span>{selectStudentResults(completed, student, value).length}</span></button>)}</div>
    {resultFilter !== "all" && <p className={styles.filterHint}>Показатели выше — за весь выбранный период и тип занятий.</p>}
    {results.length ? <ul className={styles.lessons} aria-label="Результаты проведённых занятий">{results.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} student={student} />)}</ul> : <div className={styles.empty}><strong>{resultFilter !== "all" ? "Таких результатов за период нет" : upcoming.length ? "Занятия ещё не проведены" : "Занятий по этому фильтру нет"}</strong><span>{resultFilter !== "all" ? "Можно посмотреть все результаты или выбрать другой период." : upcoming.length ? "Предстоящие занятия доступны ниже." : "Выберите другой месяц или тип занятий."}</span>{resultFilter !== "all" && <button type="button" onClick={() => changeResult("all")}>Показать все результаты</button>}</div>}
    {resultFilter === "all" && upcoming.length > 0 && <details className={styles.upcoming} key={`${month}:${lessonType}`} open={!completed.length}><summary>{upcoming.every((lesson) => lesson.state === "scheduled") ? "Предстоящие занятия" : "Другие занятия"} <span>{upcoming.length}</span></summary><ul className={styles.lessons} aria-label="Предстоящие, отменённые и перенесённые занятия">{upcoming.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} student={student} />)}</ul></details>}
    <details className={styles.progress}><summary>Подробный прогресс за период</summary><JournalSummary students={[student]} lessons={selected} period={period} /></details>
  </div>;
}
