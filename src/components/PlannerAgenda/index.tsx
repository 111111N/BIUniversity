import { Link } from "react-router-dom";
import type { PlannerNote } from "../../data/plannerStore";
import { formatPlannerTime, getNextPlannerNotes, getPlannerDayNotes, getPlannerNoteDate, getPlannerHref } from "../../domain/planner";
import ArrowCircle from "../ArrowCircle";
import styles from "./index.module.scss";

interface Props { date: Date; notes: PlannerNote[]; error?: string; onCreateTask?(): void }
const PlannerAgenda = ({ date, notes, error, onCreateTask }: Props) => {
  const dayNotes = getPlannerDayNotes(notes, date);
  const upcoming = !dayNotes.length;
  const visible = (upcoming ? getNextPlannerNotes(notes, date) : dayNotes).slice(0, 3);
  const href = getPlannerHref(date);
  return <section className={styles.agenda}>
    <header><div><span>Планировщик</span><h2>{upcoming ? "Ближайшие задачи" : "Задачи на выбранный день"}</h2></div><div className={styles.actions}>{onCreateTask && <button type="button" onClick={onCreateTask}>+ Задача</button>}<Link to={href}>{dayNotes.length > visible.length ? `Все (${dayNotes.length})` : "Открыть"}<ArrowCircle /></Link></div></header>
    {error ? <p className={styles.error} role="alert">{error}</p> : visible.length ? <div className={styles.tasks}>{visible.map((note) => <Link className={`${styles.task} ${note.completed ? styles.completed : ""}`} key={note.id} to={getPlannerHref(getPlannerNoteDate(note), note.id)} aria-label={`${note.title}${note.completed ? ", выполнено" : ""}. Открыть в планировщике`}><span className={`${styles.marker} ${note.priority === "high" ? styles.high : ""}`} aria-hidden="true">{note.completed ? "✓" : ""}</span><span><strong>{note.title}</strong><small>{upcoming ? `${getPlannerNoteDate(note).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} · ` : ""}{formatPlannerTime(note)} · {note.category === "personal" ? "Личная" : "Учебная"}</small></span><ArrowCircle /></Link>)}</div> : <div className={styles.empty}><div><strong>Задач на этот день нет</strong><p>Можно запланировать подготовку к занятиям или личные дела.</p></div>{onCreateTask ? <button type="button" className={styles.planButton} onClick={onCreateTask}>Запланировать<ArrowCircle /></button> : <Link to={href}>Запланировать<ArrowCircle /></Link>}</div>}
  </section>;
};

export default PlannerAgenda;
