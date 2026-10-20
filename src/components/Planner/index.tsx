import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { PlusIcon } from "../ButtonIcons/Icons";
import PlannerNoteForm from "../PlannerNoteForm";
import PlannerTaskCard from "../PlannerTaskCard";
import SearchField from "../SearchField";
import WeekNavigation from "./WeekNavigation";
import styles from "./index.module.scss";
import { PlannerWriteError, usePlannerNotes, type PlannerNote } from "../../data/plannerStore";
import { toLocalDateKey } from "../../domain/schedule";
import { createPlannerNote, getPlannerDayNotes, getPlannerNoteDate } from "../../domain/planner";
import { mergePlannerDraft } from "../../domain/plannerDraft";
import { matchesSearchText } from "../../domain/search";
import useDragScroll from "../../hooks/useDragScroll";
import useViewPreference from "../../hooks/useViewPreference";

const FILTERS = [["all", "Все"], ["active", "Активные"], ["study", "Учебные"], ["personal", "Личные"], ["completed", "Готово"]] as const;
type TaskFilter = typeof FILTERS[number][0];
const VIEWS = ["board", "list"] as const;
const VIEW_KEY = "bi-university-planner-view";
const matchesFilter = (note: PlannerNote, filter: TaskFilter) => filter === "all" || (filter === "active" ? !note.completed : filter === "completed" ? note.completed : note.category === filter);

interface PlannerProps {
  selectedWeekStart: Date;
  selectedDate?: Date;
  selectedTaskId?: string | null;
  onClearTask?(): void;
  onSaved?(note: PlannerNote): void;
}

const Planner = ({ selectedWeekStart, selectedDate, selectedTaskId, onClearTask, onSaved }: PlannerProps) => {
  const { notes, setNotes, refreshNotes, error: storageError } = usePlannerNotes();
  const [editingNote, setEditingNote] = useState<PlannerNote | null>(null);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [query, setQuery] = useState("");
  const [deletedNote, setDeletedNote] = useState<PlannerNote | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [completionMessage, setCompletionMessage] = useState("");
  const [view, changeView] = useViewPreference(VIEW_KEY, VIEWS, "board");
  const requestedNote = selectedTaskId ? notes.find((note) => note.id === selectedTaskId) : undefined;
  const handledTaskId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedTaskId) { handledTaskId.current = null; return; }
    if (requestedNote && handledTaskId.current !== selectedTaskId) {
      handledTaskId.current = selectedTaskId;
      setEditingNote(requestedNote);
    }
  }, [selectedTaskId, requestedNote]);
  const activeNote = editingNote;
  const closeForm = () => { setEditingNote(null); refreshNotes(); onClearTask?.(); };
  const gridRef = useRef<HTMLDivElement>(null);
  const dragScroll = useDragScroll(gridRef, { axis: "x", enabled: view === "board", resetKey: toLocalDateKey(selectedWeekStart) });
  const selectedKey = selectedDate ? toLocalDateKey(selectedDate) : "";
  const [focusedDay, setFocusedDay] = useState(selectedKey);
  useEffect(() => { setFocusedDay(selectedKey); }, [selectedKey]);
  useLayoutEffect(() => {
    if (view !== "board") return;
    const grid = gridRef.current;
    const target = grid?.querySelector<HTMLElement>(`[data-date="${focusedDay}"]`);
    if (!grid || !target) return;
    const bounds = grid.getBoundingClientRect(), dayBounds = target.getBoundingClientRect();
    if (dayBounds.left < bounds.left) grid.scrollBy({ left: dayBounds.left - bounds.left, behavior: "auto" });
    else if (dayBounds.right > bounds.right) grid.scrollBy({ left: dayBounds.right - bounds.right, behavior: "auto" });
  }, [focusedDay, view]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index)),
    [selectedWeekStart],
  );
  const activeDay = days.find((day) => toLocalDateKey(day) === focusedDay) ?? days.find((day) => selectedDate && isSameDay(day, selectedDate)) ?? days[0];
  const selectDay = (day: Date) => {
    const key = toLocalDateKey(day);
    setFocusedDay(key);
    if (view === "list") gridRef.current?.querySelector<HTMLElement>(`[data-date="${key}"]`)?.scrollIntoView({ block: "nearest", behavior: "auto" });
  };

  const saveNote = (note: PlannerNote, original: PlannerNote) => {
    setSaveMessage("");
    let savedNote = note;
    const saved = setNotes((currentNotes) => {
      const latest = currentNotes.find((item) => item.id === note.id);
      if (note.id && !latest) throw new PlannerWriteError("Эта задача уже удалена. Текст оставлен в форме — можно скопировать его в новую задачу.");
      savedNote = latest ? mergePlannerDraft(original, note, latest) : { ...note, id: crypto.randomUUID() };
      return latest ? currentNotes.map((item) => item.id === note.id ? savedNote : item) : [...currentNotes, savedNote];
    });
    if (!saved) return;
    setEditingNote(null);
    setDeletedNote(null);
    const hiddenByFilters = !matchesFilter(savedNote, filter) || !matchesSearchText(`${savedNote.title} ${savedNote.text}`, query);
    if (hiddenByFilters) resetFilters();
    setFocusedDay(toLocalDateKey(getPlannerNoteDate(savedNote)));
    if (onSaved) onSaved(savedNote); else onClearTask?.();
    setSaveMessage(`${note.id ? "Изменения сохранены" : "Задача добавлена"}${hiddenByFilters ? " · фильтры сброшены, чтобы показать задачу" : ""}`);
  };

  const createNoteForDay = (day: Date) => {
    onClearTask?.();
    setEditingNote(createPlannerNote(day));
  };

  const weekNotes = notes.filter((note) => days.some((day) => isSameDay(note.startAt ?? note.createdAt, day)));
  const searchedNotes = weekNotes.filter((note) => matchesSearchText(`${note.title} ${note.text}`, query));
  const filteredNotes = searchedNotes.filter((note) => matchesFilter(note, filter));
  const completedCount = weekNotes.filter((note) => note.completed).length;
  const hasFilters = filter !== "all" || Boolean(query.trim());
  const resetFilters = () => { setFilter("all"); setQuery(""); };
  const focusDayTask = (dayKey: string, preferredIds: string[] = [], revealCompleted = false) => requestAnimationFrame(() => {
    const day = gridRef.current?.querySelector<HTMLElement>(`[data-date="${dayKey}"]`);
    if (!day) return;
    const completed = day.querySelector<HTMLDetailsElement>("details");
    if (revealCompleted && completed) completed.open = true;
    const toggles = Array.from(day.querySelectorAll<HTMLButtonElement>("[data-task-toggle]")).filter((button) => button.getClientRects().length > 0);
    const preferred = preferredIds.map((id) => toggles.find((button) => button.dataset.taskToggle === id)).find(Boolean);
    (preferred ?? toggles[0] ?? day.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
  });
  const toggleCompleted = (id: string) => {
    let changedNote = notes.find((item) => item.id === id);
    if (!setNotes((items) => {
      const latest = items.find((item) => item.id === id);
      if (!latest) throw new PlannerWriteError("Эта задача уже удалена. Обновите список, чтобы увидеть актуальные задачи.");
      const updated = { ...latest, completed: !latest.completed };
      changedNote = updated;
      return items.map((item) => item.id === id ? updated : item);
    })) return;
    if (!changedNote) return;
    setCompletionMessage(`${changedNote.completed ? "Выполнена" : "Возвращена в работу"}: «${changedNote.title}»`);
    focusDayTask(toLocalDateKey(getPlannerNoteDate(changedNote)), [id]);
  };
  const deleteNote = (note: PlannerNote) => {
    const dayKey = toLocalDateKey(getPlannerNoteDate(note));
    const toggles = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>(`[data-date="${dayKey}"] [data-task-toggle]`) ?? []).filter((button) => button.getClientRects().length > 0);
    const index = toggles.findIndex((button) => button.dataset.taskToggle === note.id);
    const neighbours = [...toggles.slice(index + 1), ...toggles.slice(0, Math.max(0, index)).reverse()].map((button) => button.dataset.taskToggle ?? "");
    let removedNote: PlannerNote | undefined;
    if (!setNotes((items) => {
      removedNote = items.find((item) => item.id === note.id);
      if (!removedNote) throw new PlannerWriteError("Эта задача уже удалена. Обновите список, чтобы увидеть актуальные задачи.");
      return items.filter((item) => item.id !== note.id);
    })) return;
    setDeletedNote(removedNote ?? null);
    setSaveMessage("");
    focusDayTask(dayKey, neighbours);
  };
  const restoreNote = () => {
    if (!deletedNote) return;
    let restoredNote = deletedNote;
    let alreadyRestored = false;
    if (!setNotes((items) => {
      const latest = items.find((item) => item.id === deletedNote.id);
      if (latest) { restoredNote = latest; alreadyRestored = true; return items; }
      return [...items, deletedNote];
    })) return;
    const hiddenByFilters = !matchesFilter(restoredNote, filter) || !matchesSearchText(`${restoredNote.title} ${restoredNote.text}`, query);
    if (hiddenByFilters) resetFilters();
    const dayKey = toLocalDateKey(getPlannerNoteDate(restoredNote));
    setDeletedNote(null);
    setFocusedDay(dayKey);
    onSaved?.(restoredNote);
    setSaveMessage(`${alreadyRestored ? "Задача уже восстановлена" : "Задача восстановлена"}${hiddenByFilters ? " · фильтры сброшены, чтобы показать задачу" : ""}`);
    focusDayTask(dayKey, [restoredNote.id], restoredNote.completed);
  };

  return (
    <section className={styles.planner} aria-label="Задачи на неделю">
      <p className={styles.srOnly} role="status">{completionMessage}</p>
      {storageError && <div className={styles.storageError} role="alert"><span>{storageError}</span><button type="button" onClick={refreshNotes}>Повторить чтение</button></div>}
      {selectedTaskId && !requestedNote && !storageError && <div className={styles.actionNotice} role="status"><span>Задача не найдена. Возможно, она уже удалена.</span><button type="button" onClick={onClearTask}>Показать неделю</button></div>}
      {(deletedNote || saveMessage) && <div className={styles.actionNotice} role="status"><span>{deletedNote ? `Задача «${deletedNote.title}» удалена` : saveMessage}</span>{deletedNote && <button type="button" onClick={restoreNote}>Отменить удаление</button>}<button type="button" className={styles.dismissNotice} aria-label="Скрыть сообщение" onClick={() => { setDeletedNote(null); setSaveMessage(""); }}>×</button></div>}
      <div className={styles.plannerToolbar}>
        <div className={styles.tools}><SearchField label="Поиск по неделе" value={query} onChange={setQuery} placeholder="Название или описание задачи" /><div className={styles.filters} role="group" aria-label="Фильтр задач">{FILTERS.map(([value, label]) => <button type="button" aria-pressed={filter === value} className={filter === value ? styles.filterActive : ""} onClick={() => setFilter(value)} key={value}>{label}<span>{searchedNotes.filter((note) => matchesFilter(note, value)).length}</span></button>)}</div><button type="button" className={styles.createButton} onClick={() => createNoteForDay(activeDay)}><PlusIcon size={14} />Добавить задачу</button></div>
        <div className={styles.toolbarBottom}><div className={styles.weekSummary}><div><span><strong>{weekNotes.length - completedCount}</strong> к выполнению</span><span><strong>{completedCount}</strong> готово</span></div><div className={styles.progress} role="progressbar" aria-label="Задачи за неделю выполнены" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={weekNotes.length || 1}><span style={{ width: `${weekNotes.length ? completedCount / weekNotes.length * 100 : 0}%` }} /></div></div><div className={styles.viewSwitch} role="group" aria-label="Вид планировщика"><button type="button" aria-pressed={view === "board"} onClick={() => changeView("board")}>Неделя</button><button type="button" aria-pressed={view === "list"} onClick={() => changeView("list")}>Список</button></div></div>
        {hasFilters && <div className={styles.filterResult} role="status"><span>{filteredNotes.length ? `Показано ${filteredNotes.length} из ${weekNotes.length} задач` : "По этим условиям задач нет"}</span><button type="button" onClick={resetFilters}>Сбросить фильтры</button></div>}
      </div>
      <WeekNavigation days={days} counts={days.map((day) => getPlannerDayNotes(weekNotes, day).length)} selectedKey={focusedDay} boardRef={gridRef} view={view} onSelect={selectDay} />
      <div className={`${styles.weekGrid} ${view === "list" ? styles.listView : ""} ${dragScroll.dragging ? styles.dragging : ""}`} ref={gridRef} onPointerDown={dragScroll.onPointerDown} onClickCapture={dragScroll.onClickCapture} onDragStartCapture={dragScroll.onDragStartCapture} tabIndex={view === "board" ? 0 : undefined} role="region" aria-label={view === "board" ? "Задачи по дням недели. Листайте, зажав левую кнопку мыши, или прокручивайте по горизонтали" : "Задачи списком по дням недели"}>
        {days.map((day) => {
          const dayNotes = getPlannerDayNotes(filteredNotes, day);
          const allDayNotes = getPlannerDayNotes(weekNotes, day);
          const isToday = isSameDay(day, new Date());
          const hasHiddenNotes = allDayNotes.length > 0 && dayNotes.length === 0;
          const activeNotes = dayNotes.filter((note) => !note.completed);
          const doneNotes = dayNotes.filter((note) => note.completed);

          return (
            <article className={`${styles.dayColumn} ${toLocalDateKey(day) === focusedDay ? styles.selectedDay : ""}`} key={day.toISOString()} data-date={toLocalDateKey(day)}>
              <header className={styles.dayHeader}>
                <div className={styles.dayIdentity}>
                  <span className={styles.weekday}>{format(day, "EEEE", { locale: ru })}</span>
                  <div className={styles.dayDate}><time dateTime={toLocalDateKey(day)} className={`${styles.dayNumber} ${isToday ? styles.today : ""}`}>{format(day, "d")}</time><span>{isToday ? "Сегодня" : format(day, "MMM", { locale: ru })}</span></div>
                </div>
                <button type="button" className={styles.addButton} onClick={() => createNoteForDay(day)} title="Добавить задачу" aria-label={`Добавить задачу на ${format(day, "d MMMM", { locale: ru })}`}><PlusIcon size={14} /></button>
              </header>

              <div className={styles.notesList}>
                {dayNotes.length === 0 && (
                  <button type="button" className={styles.emptyState} onClick={() => hasHiddenNotes ? resetFilters() : createNoteForDay(day)}>
                    <span className={styles.emptyIcon} aria-hidden="true">{hasHiddenNotes ? "—" : <PlusIcon size={14} />}</span>
                    <strong>{hasHiddenNotes ? "Нет совпадений" : "Пока без задач"}</strong>
                    <span>{hasHiddenNotes ? "Сбросить фильтры" : "Запланировать день"}</span>
                  </button>
                )}

                {(filter === "completed" ? doneNotes : activeNotes).map((note) => <PlannerTaskCard key={note.id} note={note} onToggle={toggleCompleted} onEdit={setEditingNote} onDelete={deleteNote} />)}
                {filter !== "completed" && doneNotes.length > 0 && <details className={styles.completedGroup} open={Boolean(query.trim())}><summary><span>✓ Выполнено</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary><div>{doneNotes.map((note) => <PlannerTaskCard key={note.id} note={note} onToggle={toggleCompleted} onEdit={setEditingNote} onDelete={deleteNote} />)}</div></details>}
              </div>
              {dayNotes.length > 0 && <button type="button" className={styles.addAnother} onClick={() => createNoteForDay(day)}><PlusIcon size={12} />Добавить ещё</button>}
            </article>
          );
        })}
      </div>

      {activeNote && <PlannerNoteForm key={activeNote.id || "new"} note={activeNote} currentNote={activeNote.id ? notes.find((note) => note.id === activeNote.id) ?? null : undefined} error={storageError} onSave={saveNote} onClose={closeForm} />}
    </section>
  );
};

export default Planner;
