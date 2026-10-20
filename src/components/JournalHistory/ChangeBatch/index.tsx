import type { AcademicLesson } from "../../../domain/academic";
import { lessonTypeLabels } from "../../../domain/academic";
import { formatJournalChangeValue, journalFieldLabels, type JournalChangeGroup } from "../../../domain/journalHistory";
import styles from "./index.module.scss";

interface Props { batch: JournalChangeGroup; lessonsById: Map<string, AcademicLesson>; initiallyOpen: boolean }
const ChangeBatch = ({ batch, lessonsById, initiallyOpen }: Props) => {
  const date = new Date(batch.changedAt);
  return <details className={styles.batch} open={initiallyOpen}>
    <summary><span className={styles.avatar} aria-hidden="true">{batch.actorName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span><span className={styles.identity}><strong>{batch.actorName}</strong><time dateTime={batch.changedAt}>{date.toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></span><span className={styles.counter}>Изменений: {batch.changes.length}</span><svg className={styles.chevron} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg></summary>
    <ul>{batch.changes.map((change) => {
      const lesson = change.lessonId ? lessonsById.get(change.lessonId) : undefined;
      return <li key={change.id}><div className={styles.student}><strong>{change.studentName}</strong><span className={styles.field}>{journalFieldLabels[change.field]}</span>{lesson && <small>{new Date(`${lesson.date}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} · {lesson.startsAt} · {lessonTypeLabels[lesson.type]}<span>{lesson.topic}</span></small>}</div><div className={styles.diff}><div><span>Было</span><strong className={styles.previous}>{formatJournalChangeValue(change.previousValue, change.field)}</strong></div><span className={styles.arrow} aria-hidden="true">→</span><div><span>Стало</span><strong className={styles.next} data-value={String(change.nextValue)}>{formatJournalChangeValue(change.nextValue, change.field)}</strong></div></div></li>;
    })}</ul>
  </details>;
};

export default ChangeBatch;
