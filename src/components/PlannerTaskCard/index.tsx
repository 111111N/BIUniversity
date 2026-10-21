import { useId, useRef, useState } from "react";
import type { PlannerNote } from "../../data/plannerStore";
import { formatPlannerTime } from "../../domain/planner";
import ActionMenu from "../ActionMenu";
import styles from "./index.module.scss";

interface Props { note: PlannerNote; layout?: "board" | "list"; onEdit(note: PlannerNote): void; onToggle(id: string): void; onDelete(note: PlannerNote): void }
const PRIORITIES = { low: "Низкий", medium: "Обычный", high: "Высокий" };
const PlannerTaskCard = ({ note, layout = "board", onEdit, onToggle, onDelete }: Props) => {
  const title = note.title.trim() || "Без названия";
  const menuId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return <article data-planner-task={note.id} className={`${styles.card} ${note.completed ? styles.completed : ""} ${layout === "list" ? styles.row : ""}`}>
  <div className={styles.header}><button type="button" data-task-toggle={note.id} className={styles.check} aria-pressed={note.completed} aria-label={note.completed ? `Вернуть задачу: ${title}` : `Завершить задачу: ${title}`} onClick={() => onToggle(note.id)}>{note.completed ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg> : null}</button><h3><button type="button" className={styles.title} onClick={() => onEdit(note)} title={title}>{title}</button></h3></div>
  <div className={styles.time}><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M8 4.5V8l2.5 1.5" /></svg><span>{formatPlannerTime(note)}</span></div>
  {note.text && !note.completed && <p className={styles.description} title={note.text}>{note.text}</p>}
  <footer className={styles.footer}><div className={styles.tags}><span className={`${styles.category} ${note.category === "personal" ? styles.personal : styles.study}`}>{note.category === "study" ? "Учебная" : "Личная"}</span>{note.completed ? <span className={styles.done}>Выполнено</span> : <span className={`${styles.priority} ${styles[note.priority]}`} title={`${PRIORITIES[note.priority]} приоритет`}><i aria-hidden="true" />{PRIORITIES[note.priority]}</span>}</div>
  <button type="button" ref={menuButton} className={styles.more} data-no-drag aria-label={`Действия с задачей: ${title}`} aria-haspopup="menu" aria-expanded={Boolean(menu)} aria-controls={menu ? menuId : undefined} onClick={() => { const box = menuButton.current?.getBoundingClientRect(); if (box) setMenu(menu ? null : { x: box.right - 208, y: box.bottom + 4 }); }}><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg></button>
  </footer>{menu && <ActionMenu id={menuId} label={`Действия с задачей: ${title}`} {...menu} onClose={() => setMenu(null)} returnFocus={() => menuButton.current?.focus({ preventScroll: true })} actions={[{ label: "Редактировать", run: () => onEdit(note) }, { label: "Удалить задачу", danger: true, run: () => onDelete(note) }]} />}
</article>;
};

export default PlannerTaskCard;
