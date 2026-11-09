import { useId, useRef, useState } from "react";
import type { PlannerNote } from "../../data/plannerStore";
import { getPlannerNoteDate } from "../../domain/planner";
import { movePlannerNoteToDay } from "../../domain/plannerMove";
import { samePlannerNote } from "../../domain/plannerDraft";
import { toLocalDateKey } from "../../domain/schedule";
import DateTimePicker from "../DateTimePicker";
import CancelButton from "../CancelButton";
import Modal from "../Modal";
import styles from "./index.module.scss";

interface Props { note: PlannerNote; currentNote?: PlannerNote | null; error?: string; onRetry(): void; onMove(day: Date): void; onClose(): void }
const dayLabel = (date: Date) => date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const dateLabel = (note: PlannerNote) => dayLabel(getPlannerNoteDate(note));
const timeLabel = (date: Date) => `${dayLabel(date)} в ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
const scheduleLabel = (note: PlannerNote) => note.startAt
  ? `Начало: ${timeLabel(note.startAt)}${note.endAt ? ` · Окончание: ${timeLabel(note.endAt)}` : ""}`
  : note.endAt ? `Крайний срок: ${timeLabel(note.endAt)}` : "Без времени";
export default function PlannerMoveDialog({ note, currentNote, error, onRetry, onMove, onClose }: Props) {
  const id = useId(); const dateButton = useRef<HTMLButtonElement>(null);
  const [target, setTarget] = useState(() => getPlannerNoteDate(note));
  let preview: PlannerNote | null = null; let validation = "";
  try { preview = movePlannerNoteToDay(note, target); }
  catch (reason) { validation = reason instanceof Error ? reason.message : "Не удалось подготовить перенос."; }
  const unchanged = toLocalDateKey(target) === toLocalDateKey(getPlannerNoteDate(note));
  const deleted = currentNote === null;
  return <Modal labelledBy={id} className={styles.dialog} initialFocusRef={dateButton} onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); if (!unchanged && !deleted && !validation && !error) onMove(target); }}>
      <header className={styles.header}><h2 id={id}>Перенести задачу</h2><button type="button" className={styles.close} aria-label="Закрыть перенос" onClick={onClose}>×</button></header>
      <p className={styles.title}>{note.title.trim() || "Без названия"}</p>
      <div className={styles.field} ref={(element) => { dateButton.current = element?.querySelector<HTMLButtonElement>("button") ?? null; }}><label htmlFor={`${id}-day`}>Новый день</label><DateTimePicker id={`${id}-day`} value={target} showTime={false} allowClear={false} onChange={(day) => { if (day) setTarget(day); }} ariaLabel="Новый день задачи" /></div>
      <dl className={styles.preview}><div><dt>Исходный день</dt><dd><strong>{dateLabel(note)}</strong><span>{scheduleLabel(note)}</span></dd></div><div><dt>Новый день</dt><dd>{preview ? <><strong>{dateLabel(preview)}</strong><span>{scheduleLabel(preview)}</span></> : "Проверьте даты задачи"}</dd></div></dl>
      <p className={styles.hint}>Начало и окончание сдвигаются вместе. Время, описание и параметры задачи сохраняются. После переноса его можно отменить в сообщении на планировщике.</p>
      {deleted ? <p className={styles.error} role="alert">Задача удалена в другом месте. Перенос не восстановит её.</p> : currentNote && !samePlannerNote(note, currentNote) && <p className={styles.hint} role="status">Задача изменилась в другом месте. Если её дата или время уже изменены, перенос будет отменён.</p>}
      {(validation || error) && <p className={styles.error} role="alert">{validation || error}</p>}
      {error && <button type="button" className={styles.retry} onClick={onRetry}>Повторить чтение</button>}
      <footer className={styles.actions}><CancelButton onClick={onClose} /><button type="submit" className={styles.primary} disabled={unchanged || deleted || Boolean(validation || error)}>Перенести</button></footer>
    </form>
  </Modal>;
}
