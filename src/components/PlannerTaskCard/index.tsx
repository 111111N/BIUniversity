import type { PlannerNote } from "../../data/plannerStore";
import { formatPlannerTime } from "../../domain/planner";
import styles from "./index.module.scss";

interface Props { note: PlannerNote; onEdit(note: PlannerNote): void; onToggle(id: string): void; onDelete(note: PlannerNote): void }
const PRIORITIES = { low: "Низкий", medium: "Обычный", high: "Высокий" };
const PlannerTaskCard = ({ note, onEdit, onToggle, onDelete }: Props) => {
  const title = note.title.trim() || "Без названия";
  return <article className={`${styles.card} ${note.completed ? styles.completed : ""}`}>
  <div className={styles.header}><button type="button" data-task-toggle={note.id} className={styles.check} aria-pressed={note.completed} aria-label={note.completed ? `Вернуть задачу: ${title}` : `Завершить задачу: ${title}`} onClick={() => onToggle(note.id)}>{note.completed ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg> : null}</button><h3><button type="button" className={styles.title} onClick={() => onEdit(note)} title={title}>{title}</button></h3></div>
  <div className={styles.tags}><span className={`${styles.category} ${note.category === "personal" ? styles.personal : styles.study}`}>{note.category === "study" ? "Учебная" : "Личная"}</span>{note.completed ? <span className={styles.done}>Выполнено</span> : <span className={`${styles.priority} ${styles[note.priority]}`} title={`${PRIORITIES[note.priority]} приоритет`}><i aria-hidden="true" />{PRIORITIES[note.priority]}</span>}</div>
  {note.text && !note.completed && <p className={styles.description} title={note.text}>{note.text}</p>}
  <div className={styles.time}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.5 1.5" /></svg><span>{formatPlannerTime(note)}</span></div>
  <footer className={styles.footer}><button type="button" className={styles.open} onClick={() => onEdit(note)} aria-label={`Открыть задачу: ${title}`}>Открыть <span aria-hidden="true">→</span></button><button type="button" className={styles.delete} onClick={() => onDelete(note)} aria-label={`Удалить: ${title}`} title="Удалить задачу"><svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h12M6 5V3h6v2M5 5l.5 10h7L13 5M7.5 8v4M10.5 8v4" /></svg></button></footer>
</article>;
};

export default PlannerTaskCard;
