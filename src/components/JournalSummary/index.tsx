import type { Student } from "../Attendance/data/students";
import { getJournalMetrics } from "../../domain/journal";
import { isPerformanceLesson, type AcademicLesson } from "../../domain/academic";
import { formatCount } from "../../domain/formatCount";
import styles from "./index.module.scss";

interface JournalSummaryProps { students: Student[]; lessons: AcademicLesson[]; period: string; }

export default function JournalSummary({ students, lessons, period }: JournalSummaryProps) {
  const completedLessons = lessons.filter((lesson) => lesson.state === "completed");
  const metrics = getJournalMetrics(students, completedLessons.map((lesson) => lesson.id), completedLessons.filter(isPerformanceLesson).map((lesson) => lesson.id));
  const completion = metrics.total ? Math.round(metrics.completion) : null;
  const emptyReason = completedLessons.length ? "В группе пока нет студентов" : "Нет проведённых занятий";
  const dominantGrade = metrics.gradesCount
    ? metrics.distribution.reduce((best, item) => item.count > best.count ? item : best)
    : null;
  const strongGrades = metrics.distribution
    .filter(({ grade }) => grade >= 4)
    .reduce((total, { count }) => total + count, 0);
  const strongShare = metrics.gradesCount ? Math.round(strongGrades / metrics.gradesCount * 100) : 0;
  const riskCount = metrics.distribution.find(({ grade }) => grade === 2)?.count ?? 0;
  return <section className={styles.summary} aria-label="Показатели журнала">
    <header><h2>Результаты за период</h2><p>{period} · только проведённые занятия</p></header>
    <div className={styles.metrics}>
      <div><span><i className={styles.metricDotGrade} />Средний балл</span><strong>{metrics.average?.toFixed(2) ?? "—"}</strong><small>{formatCount(metrics.gradesCount, ["оценка", "оценки", "оценок"])} · практики и лабораторные</small></div>
      <div><span><i className={styles.metricDotAttendance} />Посещаемость</span><strong>{metrics.attendance === null ? "—" : `${Math.round(metrics.attendance)}%`}</strong><small>Присутствие среди отмеченных занятий</small></div>
      <div><span><i className={styles.metricDotCompletion} />Заполнение журнала</span><strong>{completion === null ? "—" : `${completion}%`}</strong><small>{completion === null ? emptyReason : `${metrics.marked} из ${metrics.total} отметок`}</small></div>
    </div>
    <div className={styles.completion}>
      <div><span>Готовность журнала</span><strong>{completion === null ? emptyReason : metrics.unmarked ? `${metrics.unmarked} не заполнено` : "Все отметки заполнены"}</strong></div>
      {completion !== null && <div className={styles.completionTrack} role="progressbar" aria-label={`Журнал заполнен на ${completion} процентов`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}><i style={{ width: `${metrics.completion}%` }} /></div>}
    </div>
    <div className={styles.distributionHeader}><div><span>Структура успеваемости</span><h3>Распределение оценок</h3></div><strong>{formatCount(metrics.gradesCount, ["оценка", "оценки", "оценок"])}</strong></div>
    {metrics.gradesCount ? <div className={styles.distribution}>
      <div className={styles.scale} aria-hidden="true"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      {metrics.distribution.map(({ grade, count }) => {
        const percentage = Math.round(count / metrics.gradesCount * 100);
        const label = grade === 5 ? "Отлично" : grade === 4 ? "Хорошо" : grade === 3 ? "Удовлетворительно" : "Неудовлетворительно";
        return <div className={`${styles.gradeRow} ${styles[`grade${grade}`]}`} key={grade} title={`${label}: ${formatCount(count, ["оценка", "оценки", "оценок"])}, ${percentage}%`}>
          <span className={styles.gradeBadge}>{grade}</span><span className={styles.gradeLabel}>{label}</span>
          <div className={styles.track} role="meter" aria-label={`Оценка ${grade}: ${count} из ${metrics.gradesCount}, ${percentage} процентов`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
            <i style={{ width: `${percentage}%` }} />
          </div>
          <div className={styles.gradeValue}><strong>{count}</strong><small>{percentage}%</small></div>
        </div>;
      })}
      <div className={styles.insights}>
        <div><span>Преобладает</span><strong>{dominantGrade?.count ? `Оценка ${dominantGrade.grade}` : "—"}</strong></div>
        <div><span>Оценки 4 и 5</span><strong>{strongShare}%</strong></div>
        <div className={riskCount ? styles.insightRisk : ""}><span>Неудовлетворительно</span><strong>{riskCount || "Нет"}</strong></div>
      </div>
    </div> : <div className={styles.emptyDistribution}><strong>Оценок за практики и лабораторные пока нет</strong><span>Лекции и занятия без оценки в распределение не входят.</span></div>}
  </section>;
}
