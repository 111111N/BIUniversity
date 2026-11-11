import Link from "../../components/ChecksContextLink";
import Card from "../../components/Card";
import { ASSESSMENT_KIND_LABELS, type Assessment } from "../../domain/assessmentTypes";
import OutcomeBadge from "./OutcomeBadge";
import { assessmentStartsAt } from "../../domain/assessments";
import useAssessmentClock from "./useAssessmentClock";
import { displayDate } from "./model";
import styles from "./index.module.scss";

export default function AssessmentCatalogCard({ assessment, actorId, student = false, example = false }: { assessment: Assessment; actorId: string; student?: boolean; example?: boolean }) {
  const now = useAssessmentClock();
  const last = assessment.attempts.at(-1);
  const upcoming = last && last.state === "draft" && assessmentStartsAt(last) > Date.parse(now);
  const result = last?.results.find((item) => item.studentId === actorId)?.outcome ?? null;
  const href = `/assessments/${encodeURIComponent(assessment.id)}${example ? "?example=1" : ""}`;
  return <Card as="article" className={styles.catalogCard}>
    <div className={styles.catalogBody}>
      <div className={styles.metadata}><span className={styles.kindBadge}>{ASSESSMENT_KIND_LABELS[assessment.kind]}</span><span>{assessment.groupName}</span><span>{assessment.period}</span></div>
      <h2><Link to={href}>{assessment.title}</Link></h2>
      {assessment.subjectName && assessment.subjectName !== assessment.title && <p className={styles.note}>{assessment.subjectName}</p>}
      <dl className={styles.catalogFacts}>
        <div><dt>Последняя попытка</dt><dd>{last ? `${displayDate(last.date)}, ${last.startsAt} (Москва)` : "Нет опубликованных попыток"}</dd></div>
        <div><dt>Семестр</dt><dd>{assessment.recordBook?.semester ?? "Не указан"}</dd></div>
        <div><dt>Попыток</dt><dd>{assessment.attempts.length}</dd></div>
        {assessment.recordBook && <div><dt>Программа</dt><dd>{assessment.recordBook.hours} ч · {assessment.recordBook.category === "elective" ? "Факультатив" : "Основная программа"}</dd></div>}
      </dl>
    </div>
    <div className={styles.catalogStatus}>
      {student && last?.state === "published" ? <OutcomeBadge outcome={result} as="strong" /> : <span className={last?.state === "published" ? styles.published : styles.badge}>{last?.state === "cancelled" ? "Отменено" : last?.state === "published" ? "Опубликовано" : upcoming ? "Предстоит" : student ? "Ожидается результат" : "Черновик"}</span>}
      <Link className={styles.openLink} to={href}>{student ? "Результаты и попытки" : "Открыть ведомости"}<span aria-hidden="true"> →</span><span className={styles.visuallyHidden}>: {assessment.title}</span></Link>
    </div>
  </Card>;
}
