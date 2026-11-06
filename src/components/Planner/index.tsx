import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { PlusIcon } from "../ButtonIcons/Icons";
import PlannerNoteForm from "../PlannerNoteForm";
import PlannerMoveDialog from "../PlannerMoveDialog";
import PlannerTaskCard from "../PlannerTaskCard";
import SearchField from "../SearchField";
import WeekNavigation from "./WeekNavigation";
import styles from "./index.module.scss";
import { PlannerWriteError, usePlannerNotes, type PlannerNote } from "../../data/plannerStore";
import { toLocalDateKey } from "../../domain/schedule";
import { createPlannerNote, getPlannerDayNotes, getPlannerNoteDate } from "../../domain/planner";
import { mergePlannerDraft } from "../../domain/plannerDraft";
import { applyPlannerMove, undoPlannerMove, type PlannerMoveSnapshot } from "../../domain/plannerMove";
import { usePlannerTaskFocus } from "./useTaskFocus";
import { usePlannerTaskDrag } from "./useTaskDrag";
import { matchesSearchText } from "../../domain/search";
import { expandMatchingCompletedDays } from "./completedGroups";
import useDragScroll from "../../hooks/useDragScroll";
import { readPlannerView } from "./viewPreference";
import { CATEGORY_FILTERS, STATUS_FILTERS, matchesFilters, type CategoryFilter, type StatusFilter } from "./taskFilters";

const VIEW_KEY = "bi-university-planner-view";

interface PlannerProps {
  weekNavigation?: ReactNode;
  selectedWeekStart: Date;
  selectedDate?: Date;
  onSelectDay?(day: Date, clearTask?: boolean): void;
  selectedTaskId?: string | null;
  onClearTask?(): void;
  onSaved?(note: PlannerNote): void;
}

const Planner = ({ weekNavigation, selectedWeekStart, selectedDate, onSelectDay, selectedTaskId, onClearTask, onSaved }: PlannerProps) => {
  const { notes, setNotes, refreshNotes, error: storageError } = usePlannerNotes();
  const [editingNote, setEditingNote] = useState<PlannerNote | null>(null);
  const [movingNote, setMovingNote] = useState<PlannerNote | null>(null);
  const [moveUndo, setMoveUndo] = useState<PlannerMoveSnapshot | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [deletedNote, setDeletedNote] = useState<PlannerNote | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [completionMessage, setCompletionMessage] = useState("");
  const [completedOpen, setCompletedOpen] = useState<Record<string, boolean>>({});
  const [view, setView] = useState(() => readPlannerView(VIEW_KEY));
  const changeView = (next: "board" | "list") => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* Keep the selected view in memory. */ }
  };
  const requestedNote = selectedTaskId ? notes.find((note) => note.id === selectedTaskId) : undefined;
  const handledTaskId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedTaskId) { handledTaskId.current = null; return; }
    if (requestedNote && handledTaskId.current !== selectedTaskId) {
      handledTaskId.current = selectedTaskId;
      if (requestedNote.completed) setCompletedOpen((current) => ({ ...current, [toLocalDateKey(getPlannerNoteDate(requestedNote))]: true }));
      if (!selectedDate || !isSameDay(selectedDate, getPlannerNoteDate(requestedNote))) onSelectDay?.(getPlannerNoteDate(requestedNote), false);
      setMovingNote(null);
      setEditingNote(requestedNote);
    }
  }, [selectedTaskId, requestedNote, onSelectDay, selectedDate]);
  const activeNote = editingNote;
  const closeForm = () => { setEditingNote(null); refreshNotes(); onClearTask?.(); };
  const gridRef = useRef<HTMLDivElement>(null);
  const focusDayTask = usePlannerTaskFocus(gridRef, toLocalDateKey(selectedWeekStart));
  const dragScroll = useDragScroll(gridRef, { axis: "x", enabled: view === "board", resetKey: toLocalDateKey(selectedWeekStart) });
  const selectedKey = selectedDate ? toLocalDateKey(selectedDate) : "";
  const focusedDay = selectedKey || toLocalDateKey(selectedWeekStart);
  const updateQuery = (next: string) => {
    if (next !== query) setCompletedOpen((current) => expandMatchingCompletedDays(current, notes, next));
    setQuery(next);
  };
  useLayoutEffect(() => {
    if (view !== "board") return;
    const grid = gridRef.current;
    if (!grid) return;
    const revealDay = () => {
      const target = grid.querySelector<HTMLElement>(`[data-date="${focusedDay}"]`);
      if (!target) return;
      const bounds = grid.getBoundingClientRect(), dayBounds = target.getBoundingClientRect();
      if (dayBounds.left < bounds.left) grid.scrollBy({ left: dayBounds.left - bounds.left, behavior: "auto" });
      else if (dayBounds.right > bounds.right) grid.scrollBy({ left: dayBounds.right - bounds.right, behavior: "auto" });
    };
    revealDay();
    let width = grid.clientWidth;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      if (grid.clientWidth === width) return;
      width = grid.clientWidth;
      revealDay();
    });
    observer?.observe(grid);
    return () => observer?.disconnect();
  }, [focusedDay, view, selectedWeekStart]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index)),
    [selectedWeekStart],
  );
  const activeDay = days.find((day) => toLocalDateKey(day) === focusedDay) ?? days.find((day) => selectedDate && isSameDay(day, selectedDate)) ?? days[0];
  const selectDay = (day: Date) => {
    const key = toLocalDateKey(day);
    onSelectDay?.(day);
    if (view === "list") gridRef.current?.querySelector<HTMLElement>(`[data-date="${key}"]`)?.scrollIntoView({ block: "nearest", behavior: "auto" });
    else requestAnimationFrame(() => {
      const grid = gridRef.current;
      const target = grid?.querySelector<HTMLElement>(`[data-date="${key}"]`);
      if (grid && target) grid.scrollBy({ left: target.getBoundingClientRect().left - grid.getBoundingClientRect().left, behavior: "auto" });
    });
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
    setMoveUndo(null);
    const hiddenByFilters = !matchesFilters(savedNote, status, category) || !matchesSearchText(`${savedNote.title} ${savedNote.text}`, query);
    if (hiddenByFilters) resetFilters();
    if (savedNote.completed) setCompletedOpen((current) => ({ ...current, [toLocalDateKey(getPlannerNoteDate(savedNote))]: true }));
    if (onSaved) onSaved(savedNote); else { onSelectDay?.(getPlannerNoteDate(savedNote)); onClearTask?.(); }
    setSaveMessage(`${note.id ? "Изменения сохранены" : "Задача добавлена"}${hiddenByFilters ? " · фильтры сброшены, чтобы показать задачу" : ""}`);
  };

  const createNoteForDay = (day: Date) => {
    onSelectDay?.(day);
    if (!onSelectDay) onClearTask?.();
    setEditingNote(createPlannerNote(day));
  };

  const weekNotes = notes.filter((note) => days.some((day) => isSameDay(note.startAt ?? note.createdAt, day)));
  const searchedNotes = weekNotes.filter((note) => matchesSearchText(`${note.title} ${note.text}`, query));
  const filteredNotes = searchedNotes.filter((note) => matchesFilters(note, status, category));
  const completedCount = weekNotes.filter((note) => note.completed).length;
  const hasFilters = status !== "all" || category !== "all" || Boolean(query.trim());
  const resetFilters = () => { setStatus("all"); setCategory("all"); updateQuery(""); };
  const revealMovedNote = (note: PlannerNote) => {
    if (!matchesFilters(note, status, category) || !matchesSearchText(`${note.title} ${note.text}`, query)) resetFilters();
    const day = toLocalDateKey(getPlannerNoteDate(note));
    if (note.completed) setCompletedOpen((current) => ({ ...current, [day]: true }));
    if (onSaved) onSaved(note); else { onSelectDay?.(getPlannerNoteDate(note)); onClearTask?.(); }
    focusDayTask(day, [note.id], note.completed);
  };
  const transferNote = (original: PlannerNote, target: Date) => {
    const outcome: { result?: ReturnType<typeof applyPlannerMove> } = {};
    if (!setNotes((items) => {
      const result = applyPlannerMove(items, original, target);
      outcome.result = result;
      return result.notes;
    }) || !outcome.result) return;
    const result = outcome.result;
    setMovingNote(null);
    setDeletedNote(null);
    setMoveUndo(result.changed ? { before: result.before, after: result.after } : null);
    setSaveMessage(result.changed ? `Задача перенесена на ${format(getPlannerNoteDate(result.after), "d MMMM yyyy", { locale: ru })}` : "Задача уже находится в выбранном дне");
    revealMovedNote(result.after);
  };
  const undoTransfer = () => {
    if (!moveUndo) return;
    const outcome: { result?: ReturnType<typeof undoPlannerMove> } = {};
    if (!setNotes((items) => {
      const result = undoPlannerMove(items, moveUndo);
      outcome.result = result;
      return result.notes;
    }) || !outcome.result) return;
    setMoveUndo(null);
    setSaveMessage("Перенос отменён");
    revealMovedNote(outcome.result.after);
  };
  const openMove = (note: PlannerNote) => { if (!editingNote) setMovingNote(note); };
  const taskDrag = usePlannerTaskDrag(gridRef, `${toLocalDateKey(selectedWeekStart)}:${view}`, !editingNote && !movingNote && !storageError, transferNote);
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
    const changedDayKey = toLocalDateKey(getPlannerNoteDate(changedNote));
    if (changedNote.completed) setCompletedOpen((current) => ({ ...current, [changedDayKey]: true }));
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
    setMoveUndo(null);
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
    const hiddenByFilters = !matchesFilters(restoredNote, status, category) || !matchesSearchText(`${restoredNote.title} ${restoredNote.text}`, query);
    if (hiddenByFilters) resetFilters();
    const dayKey = toLocalDateKey(getPlannerNoteDate(restoredNote));
    setDeletedNote(null);
    if (restoredNote.completed) setCompletedOpen((current) => ({ ...current, [dayKey]: true }));
    if (onSaved) onSaved(restoredNote); else onSelectDay?.(getPlannerNoteDate(restoredNote));
    setSaveMessage(`${alreadyRestored ? "Задача уже восстановлена" : "Задача восстановлена"}${hiddenByFilters ? " · фильтры сброшены, чтобы показать задачу" : ""}`);
    focusDayTask(dayKey, [restoredNote.id], restoredNote.completed);
  };

  return (
    <section className={styles.planner} aria-label="Задачи на неделю">
      {weekNavigation && <div className={styles.weekNavigation}>{weekNavigation}</div>}
      <p className={styles.srOnly} role="status">{completionMessage}</p>
      {storageError && <div className={styles.storageError} role="alert"><span>{storageError}</span><button type="button" onClick={refreshNotes}>Повторить чтение</button></div>}
      {selectedTaskId && !requestedNote && !storageError && <div className={styles.actionNotice} role="status"><span>Задача не найдена. Возможно, она уже удалена.</span><button type="button" onClick={onClearTask}>Показать неделю</button></div>}
      {!storageError && (deletedNote || saveMessage) && <div className={styles.actionNotice} role="status"><span>{deletedNote ? `Задача «${deletedNote.title}» удалена` : saveMessage}</span>{deletedNote && <button type="button" onClick={restoreNote}>Отменить удаление</button>}{!deletedNote && moveUndo && <button type="button" onClick={undoTransfer}>Отменить перенос</button>}<button type="button" className={styles.dismissNotice} aria-label="Скрыть сообщение" onClick={() => { setDeletedNote(null); setMoveUndo(null); setSaveMessage(""); }}>×</button></div>}
      <div className={styles.plannerToolbar}>
        <div className={styles.toolbarTop}><div className={styles.filterGroups}><div className={styles.filterGroup}><span>Статус</span><div className={styles.filters} role="group" aria-label="Статус задачи">{STATUS_FILTERS.map(([value, label]) => <button type="button" aria-pressed={status === value} className={status === value ? styles.filterActive : ""} onClick={() => setStatus(value)} key={value}>{label}<span>{searchedNotes.filter((note) => matchesFilters(note, value, category)).length}</span></button>)}</div></div><div className={styles.filterGroup}><span>Категория</span><div className={styles.filters} role="group" aria-label="Категория задачи">{CATEGORY_FILTERS.map(([value, label]) => <button type="button" aria-pressed={category === value} className={category === value ? styles.filterActive : ""} onClick={() => setCategory(value)} key={value}>{label}<span>{searchedNotes.filter((note) => matchesFilters(note, status, value)).length}</span></button>)}</div></div></div><div className={styles.toolbarActions}><button type="button" className={styles.createButton} aria-label="Создать задачу" onClick={() => createNoteForDay(activeDay)}><PlusIcon size={16} />Создать</button><div className={styles.viewSwitch} role="group" aria-label="Вид планировщика"><button type="button" aria-pressed={view === "board"} onClick={() => changeView("board")}>Неделя</button><button type="button" aria-pressed={view === "list"} onClick={() => changeView("list")}>Список</button></div></div></div>
        <div className={styles.tools}><div className={styles.search}><SearchField label="Поиск по неделе" value={query} onChange={updateQuery} placeholder="Название или описание задачи" /></div><div className={styles.weekSummary}>{weekNotes.length ? <><span>Выполнено <strong>{completedCount} из {weekNotes.length}</strong></span><div className={styles.progress} role="progressbar" aria-label="Задачи за неделю выполнены" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={weekNotes.length}><span style={{ width: `${completedCount / weekNotes.length * 100}%` }} /></div></> : <span>На этой неделе пока нет задач</span>}</div></div>
        {hasFilters && <div className={styles.filterResult} role="status"><span>{filteredNotes.length ? `Найдено за неделю: ${filteredNotes.length} из ${weekNotes.length} задач` : "По этим условиям задач за неделю нет"}</span><button type="button" onClick={resetFilters}>Сбросить фильтры</button></div>}
      </div>
      {!weekNotes.length && !storageError && <div className={styles.emptyWeek}><div><strong>Спланируйте свою неделю</strong><p>Добавьте учебную задачу или личное дело на подходящий день.</p></div><button type="button" onClick={() => createNoteForDay(activeDay)}><PlusIcon size={16} />Первая задача</button></div>}
      {weekNotes.length > 0 && filteredNotes.length === 0 && hasFilters && <div className={styles.emptyWeek} role="status"><div><strong>По этим условиям задач нет</strong><p>Измените поиск, статус или категорию, чтобы увидеть задачи недели.</p></div><button type="button" onClick={resetFilters}>Сбросить фильтры</button></div>}
      <WeekNavigation days={days} counts={days.map((day) => getPlannerDayNotes(weekNotes, day).length)} selectedKey={focusedDay} boardRef={gridRef} view={view} onSelect={selectDay} />
      {(view === "board") && <p className={styles.boardHint}>Неделя прокручивается по горизонтали. На телефоне можно переключиться на список.</p>}
      <div className={`${styles.weekGrid} ${view === "list" ? styles.listView : ""} ${dragScroll.dragging ? styles.dragging : ""}`} ref={gridRef} onPointerDown={dragScroll.onPointerDown} onClickCapture={dragScroll.onClickCapture} onDragStartCapture={dragScroll.onDragStartCapture} tabIndex={view === "board" ? 0 : undefined} role="region" aria-label={view === "board" ? "Задачи по дням недели. Листайте, зажав левую кнопку мыши, или прокручивайте по горизонтали" : "Задачи списком по дням недели"}>
        {days.map((day) => {
          const dayNotes = getPlannerDayNotes(filteredNotes, day);
          const allDayNotes = getPlannerDayNotes(weekNotes, day);
          const isToday = isSameDay(day, new Date());
          const isSelected = toLocalDateKey(day) === focusedDay;
          const activeNotes = dayNotes.filter((note) => !note.completed);
          const doneNotes = dayNotes.filter((note) => note.completed);

          return (
            <article className={`${styles.dayColumn} ${isSelected ? styles.selectedDay : ""} ${taskDrag.targetDay === toLocalDateKey(day) ? styles.dropTarget : ""}`} key={day.toISOString()} data-date={toLocalDateKey(day)} onDragOver={(event) => taskDrag.over(event, toLocalDateKey(day))} onDragLeave={taskDrag.leave} onDrop={(event) => taskDrag.drop(event, toLocalDateKey(day))}>
              <header className={styles.dayHeader}>
                <div className={styles.dayIdentity}>
                  <span className={styles.weekday}>{format(day, "EEEE", { locale: ru })}<small aria-label={`Задач за день: ${allDayNotes.length}`}>{allDayNotes.length}</small></span>
                  <div className={styles.dayDate}><time dateTime={toLocalDateKey(day)} className={`${styles.dayNumber} ${isToday ? styles.today : ""}`}>{format(day, "d")}</time><span>{isToday ? "Сегодня" : format(day, "MMM", { locale: ru })}</span>{isSelected && <span className={styles.selectedLabel}>Выбрано</span>}</div>
                </div>
                <button type="button" className={styles.addButton} onClick={() => createNoteForDay(day)} title="Добавить задачу" aria-label={`Добавить задачу на ${format(day, "d MMMM", { locale: ru })}`}><PlusIcon size={14} /></button>
              </header>

              <div className={styles.notesList}>
                {dayNotes.length === 0 && weekNotes.length > 0 && <p className={styles.emptyState}>{hasFilters ? "Нет задач по текущим условиям" : "На этот день задач нет"}</p>}

                {(status === "completed" ? doneNotes : activeNotes).map((note) => <PlannerTaskCard key={note.id} note={note} layout={view} onToggle={toggleCompleted} onEdit={setEditingNote} onMove={openMove} onDragTask={taskDrag.start} onDragTaskEnd={taskDrag.clear} onDelete={deleteNote} />)}
                {status !== "completed" && doneNotes.length > 0 && <details className={styles.completedGroup} open={Boolean(completedOpen[toLocalDateKey(day)])} onToggle={(event) => {
                  const open = event.currentTarget.open;
                  const key = toLocalDateKey(day);
                  setCompletedOpen((current) => current[key] === open ? current : { ...current, [key]: open });
                }}><summary><span>Выполнено · {doneNotes.length}</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary><div>{doneNotes.map((note) => <PlannerTaskCard key={note.id} note={note} layout={view} onToggle={toggleCompleted} onEdit={setEditingNote} onMove={openMove} onDragTask={taskDrag.start} onDragTaskEnd={taskDrag.clear} onDelete={deleteNote} />)}</div></details>}
              </div>
              {weekNotes.length > 0 && <button type="button" className={styles.addAnother} onClick={() => createNoteForDay(day)}><PlusIcon size={12} />Добавить{dayNotes.length > 0 ? " ещё" : " задачу"}</button>}
            </article>
          );
        })}
      </div>

      {activeNote && <PlannerNoteForm key={activeNote.id || "new"} note={activeNote} currentNote={activeNote.id && !storageError ? notes.find((note) => note.id === activeNote.id) ?? null : undefined} error={storageError} onSave={saveNote} onClose={closeForm} />}
      {movingNote && <PlannerMoveDialog key={movingNote.id} note={movingNote} currentNote={storageError ? undefined : notes.find((note) => note.id === movingNote.id) ?? null} error={storageError} onRetry={refreshNotes} onMove={(day) => transferNote(movingNote, day)} onClose={() => { setMovingNote(null); refreshNotes(); }} />}
    </section>
  );
};

export default Planner;
