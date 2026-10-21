import { useId, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, differenceInMinutes, startOfDay } from "date-fns";
import type { PlannerNote } from "../../data/plannerStore";
import { formatPlannerTime } from "../../domain/planner";
import { samePlannerNote } from "../../domain/plannerDraft";
import { toLocalDateKey } from "../../domain/schedule";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { changesPlannerTask } from "../../domain/unsavedNavigation";
import ConfirmDialog from "../ConfirmDialog";
import DateTimePicker from "../DateTimePicker";
import Dropdown from "../Dropdown";
import Modal from "../Modal";
import styles from "./index.module.scss";

interface Props { note: PlannerNote; currentNote?: PlannerNote | null; error?: string; onSave(note: PlannerNote, original: PlannerNote): void; onClose(): void }
const PlannerNoteForm = ({ note, currentNote, error, onSave, onClose }: Props) => {
  const id = useId();
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const [startAt, setStartAt] = useState(note.startAt);
  const [endAt, setEndAt] = useState(note.endAt);
  const [priority, setPriority] = useState(note.priority);
  const [category, setCategory] = useState(note.category);
  const [plannedDay, setPlannedDay] = useState(() => startOfDay(note.startAt ?? note.createdAt));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [validation, setValidation] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const initialNote = useRef(note).current;
  const changedElsewhere = currentNote && !samePlannerNote(initialNote, currentNote);
  const deletedElsewhere = Boolean(initialNote.id) && currentNote === null;
  const day = startAt ?? plannedDay;
  const dirty = title !== initialNote.title || text !== initialNote.text || priority !== initialNote.priority || category !== initialNote.category || startAt?.getTime() !== initialNote.startAt?.getTime() || endAt?.getTime() !== initialNote.endAt?.getTime() || toLocalDateKey(day) !== toLocalDateKey(initialNote.startAt ?? initialNote.createdAt);
  const duration = startAt && endAt ? differenceInMinutes(endAt, startAt) : 0;
  const durationLabel = duration > 0 ? [Math.floor(duration / 60) ? `${Math.floor(duration / 60)} ч` : "", duration % 60 ? `${duration % 60} мин` : ""].filter(Boolean).join(" ") : "";
  useUnsavedChangesWarning(dirty, changesPlannerTask);
  const requestClose = () => { if (dirty) setConfirmDiscard(true); else onClose(); };
  const changeDay = (date?: Date) => {
    if (!date) return;
    const offset = differenceInCalendarDays(date, day);
    setPlannedDay(startOfDay(date));
    if (startAt) setStartAt(addDays(startAt, offset));
    if (endAt) setEndAt(addDays(endAt, offset));
    setValidation("");
  };
  const submit = () => {
    if (!title.trim() && !text.trim()) { setValidation("Добавьте название или описание задачи."); titleRef.current?.focus(); return; }
    if (startAt && endAt && endAt <= startAt) { setValidation("Время окончания должно быть позже времени начала."); return; }
    if (!startAt && endAt && endAt < startOfDay(plannedDay)) { setValidation("Срок окончания не может быть раньше выбранного дня задачи."); return; }
    setValidation("");
    const samePlannedDay = toLocalDateKey(day) === toLocalDateKey(initialNote.startAt ?? initialNote.createdAt);
    const createdAt = startAt || (!initialNote.startAt && samePlannedDay) ? initialNote.createdAt : plannedDay;
    onSave({ ...initialNote, title: title.trim() || "Без названия", text: text.trim(), createdAt, startAt, endAt, priority, category }, initialNote);
  };
  if (confirmDiscard) return <ConfirmDialog title="Закрыть без сохранения?" confirmLabel="Не сохранять" cancelLabel="Продолжить редактирование" onConfirm={onClose} onCancel={() => setConfirmDiscard(false)}><p>Изменения в задаче не сохранены. Можно вернуться к редактированию и сохранить их.</p></ConfirmDialog>;
  return <Modal className={styles.form} labelledBy={id} onClose={requestClose} initialFocusRef={titleRef}>
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- The form handles Ctrl/Cmd+Enter from its fields while preserving native field controls. */}
    <form onSubmit={(event) => { event.preventDefault(); submit(); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.defaultPrevented) { event.preventDefault(); submit(); } }}>
      <header className={styles.header}><div><span>Планировщик</span><h2 id={id}>{note.id ? "Редактировать задачу" : "Новая задача"}</h2></div><button type="button" className={styles.close} onClick={requestClose} aria-label="Закрыть">×</button></header>
      {(changedElsewhere || deletedElsewhere) && <p className={styles.externalNotice} role="status">{deletedElsewhere ? "Задача удалена в другом месте. Черновик оставлен здесь, чтобы вы могли скопировать текст. Сохранение не восстановит удалённую задачу." : "Сохранённая задача обновилась в другом месте. Независимые правки будут объединены; при конфликте ваш черновик останется открытым."}</p>}
      <p className={styles.day}>{day.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}<span>{startAt || endAt ? `${formatPlannerTime({ ...note, startAt, endAt })}${durationLabel ? ` · ${durationLabel}` : ""}` : "Без времени"}</span></p>
      <fieldset className={styles.section}><legend>Задача</legend>
      <label className={styles.field}>Название<input ref={titleRef} value={title} placeholder="Например, подготовить материалы к паре" onChange={(event) => { setTitle(event.target.value); setValidation(""); }} /></label>
      <label className={styles.field}>Описание<textarea value={text} placeholder="Детали, ссылки и заметки" onChange={(event) => setText(event.target.value)} /></label>
      </fieldset>
      <fieldset className={styles.section}><legend>Когда</legend>
      <div className={styles.field}><span>День задачи</span><DateTimePicker value={day} showTime={false} allowClear={false} onChange={changeDay} ariaLabel="День задачи" /></div>
      <div className={styles.columns}><div className={styles.field}><span>Начало · необязательно</span><DateTimePicker value={startAt} initialDate={plannedDay} onChange={(date) => { if (date) setPlannedDay(startOfDay(date)); setStartAt(date); setValidation(""); }} placeholder="Без времени" ariaLabel="Начало задачи" /></div><div className={styles.field}><span>Окончание · необязательно</span><DateTimePicker value={endAt} initialDate={startAt ?? plannedDay} onChange={(date) => { setEndAt(date); setValidation(""); }} placeholder="Не задано" ariaLabel="Окончание задачи" /></div></div>
      {!startAt && endAt && <p className={styles.timeHint}>Задача останется в выбранном дне. «Окончание» — её крайний срок, даже если он позже этого дня.</p>}
      </fieldset>
      <fieldset className={styles.section}><legend>Параметры</legend><div className={`${styles.columns} ${styles.metadata}`}><Dropdown label="Категория" value={category} onChange={(value) => setCategory(value as PlannerNote["category"])} options={[{ value: "study", label: "Учебная" }, { value: "personal", label: "Личная" }]} /><Dropdown label="Приоритет" value={priority} onChange={(value) => setPriority(value as PlannerNote["priority"])} options={[{ value: "low", label: "Низкий" }, { value: "medium", label: "Обычный" }, { value: "high", label: "Высокий" }]} /></div></fieldset>
      {(validation || error) && <p className={styles.error} role="alert">{validation || error}</p>}
      <footer className={styles.footer}><span className={styles.saveHint}>{dirty ? "Есть несохранённые изменения" : "Ctrl / ⌘ + Enter — сохранить"}</span><div className={styles.actions}><button type="button" onClick={requestClose}>Отмена</button><button type="submit" className={styles.save}>{note.id ? "Сохранить изменения" : "Добавить задачу"}</button></div></footer>
    </form>
  </Modal>;
};

export default PlannerNoteForm;
