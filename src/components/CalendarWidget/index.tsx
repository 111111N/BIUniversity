import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { getCalendarMonthDays, getDayInMonth, parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import ArrowCircle from "../ArrowCircle";
import Tooltip from "../Tooltip";
import styles from "./index.module.scss";

interface CalendarProps {
  months?: number;
  selectedDate?: Date;
  onSelectDate?(date: Date): void;
  getDaySummary?(date: Date): { lessons: number | null; tasks: number | null };
}

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const Calendar = ({ months = 1, selectedDate, onSelectDate, getDaySummary }: CalendarProps) => {
  const today = new Date();
  const selectedKey = toLocalDateKey(selectedDate ?? today);
  const [firstMonth, setFirstMonth] = useState(() => new Date((selectedDate ?? today).getFullYear(), (selectedDate ?? today).getMonth(), 1));
  const [focusedKey, setFocusedKey] = useState(selectedKey);
  const externalSelection = useRef(selectedKey);
  const calendarRef = useRef<HTMLDivElement>(null);
  const focusRequested = useRef(false);
  const helpId = useId();
  const visibleMonths = Array.from({ length: Math.max(1, months) }, (_, index) => new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1));
  const title = visibleMonths.map((date) => date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })).join(" · ");
  const selectedSummary = getDaySummary?.(selectedDate ?? today) ?? { lessons: 0, tasks: 0 };
  useEffect(() => {
    if (externalSelection.current === selectedKey) return;
    externalSelection.current = selectedKey;
    const date = parseCalendarDate(selectedKey);
    if (!date) return;
    setFirstMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setFocusedKey(selectedKey);
  }, [selectedKey]);
  useLayoutEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    calendarRef.current?.querySelector<HTMLButtonElement>(`[data-calendar-date="${focusedKey}"][data-calendar-current="true"]`)?.focus({ preventScroll: true });
  }, [focusedKey, firstMonth]);
  const moveMonth = (offset: number) => {
    const month = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + offset, 1);
    const focusedDate = parseCalendarDate(focusedKey) ?? selectedDate ?? today;
    setFirstMonth(month);
    setFocusedKey(toLocalDateKey(getDayInMonth(focusedDate, month)));
  };
  const onDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = new Date(date);
    const weekday = (date.getDay() + 6) % 7;
    if (event.key === "ArrowLeft") next.setDate(next.getDate() - 1);
    else if (event.key === "ArrowRight") next.setDate(next.getDate() + 1);
    else if (event.key === "ArrowUp") next.setDate(next.getDate() - 7);
    else if (event.key === "ArrowDown") next.setDate(next.getDate() + 7);
    else if (event.key === "Home") next.setDate(next.getDate() - weekday);
    else if (event.key === "End") next.setDate(next.getDate() + 6 - weekday);
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const month = new Date(date.getFullYear(), date.getMonth() + (event.key === "PageUp" ? -1 : 1), 1);
      next.setTime(getDayInMonth(date, month).getTime());
    } else return;
    event.preventDefault();
    if (toLocalDateKey(next) === toLocalDateKey(date)) return;
    const lastMonth = visibleMonths[visibleMonths.length - 1];
    if (next < firstMonth || next >= new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 1)) setFirstMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    focusRequested.current = true;
    setFocusedKey(toLocalDateKey(next));
  };

  return <div className={styles.calendarWidget} ref={calendarRef}>
    <div className={styles.calendarToolbar}>
      <button type="button" className={styles.navButton} onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц"><ArrowCircle direction="left" /></button>
      <strong aria-live="polite" aria-atomic="true">{title}</strong>
      <button type="button" className={styles.navButton} onClick={() => moveMonth(1)} aria-label="Следующий месяц"><ArrowCircle /></button>
    </div>
    {onSelectDate && <div className={styles.legend}><span><i className={styles.lessonDot} />Занятия</span><span><i className={styles.taskDot} />Задачи</span><button type="button" onClick={() => { const date = new Date(); setFirstMonth(new Date(date.getFullYear(), date.getMonth(), 1)); setFocusedKey(toLocalDateKey(date)); onSelectDate(date); }}>Сегодня</button></div>}
    <p id={helpId} className={styles.srOnly}>Стрелки — соседний день или неделя. Home и End — начало и конец недели. Page Up и Page Down — смена месяца. Enter — выбрать день.</p>
    <div className={styles.calendarContainer}>
      {visibleMonths.map((monthDate) => <div className={styles.calendarMonth} key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`}>
        <div className={styles.calendarGrid}>
          {DAYS.map((day) => <span key={day} className={styles.calendarDayName}>{day}</span>)}
          {getCalendarMonthDays(monthDate).map((date) => {
            const isCurrentMonth = date.getMonth() === monthDate.getMonth() && date.getFullYear() === monthDate.getFullYear();
            const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const dateKey = toLocalDateKey(date);
            const summary = getDaySummary?.(date) ?? { lessons: 0, tasks: 0 };
            const label = `Занятия: ${summary.lessons ?? "недоступны"}, задачи: ${summary.tasks ?? "недоступны"}`;
            return <Tooltip key={dateKey} label={label}><button
              type="button"
              data-calendar-date={dateKey}
              data-calendar-current={isCurrentMonth}
              tabIndex={dateKey === focusedKey && isCurrentMonth ? 0 : -1}
              aria-describedby={helpId}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={onSelectDate ? dateKey === selectedKey : undefined}
              aria-label={`${date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. ${label}`}
              className={`${styles.calendarDay} ${!isCurrentMonth ? styles.outsideDay : ""} ${isWeekend ? styles.weekend : ""} ${isToday ? styles.today : ""} ${onSelectDate && dateKey === selectedKey ? styles.selected : ""}`}
              onFocus={() => setFocusedKey(dateKey)}
              onKeyDown={(event) => onDayKeyDown(event, date)}
              onClick={() => { if (!isCurrentMonth) { focusRequested.current = true; setFirstMonth(new Date(date.getFullYear(), date.getMonth(), 1)); } setFocusedKey(dateKey); onSelectDate?.(date); }}
            ><time dateTime={dateKey}>{date.getDate()}</time><span className={styles.dots} aria-hidden="true">{(summary.lessons ?? 0) > 0 && <i className={styles.lessonDot} />}{(summary.tasks ?? 0) > 0 && <i className={styles.taskDot} />}</span></button></Tooltip>;
          })}
        </div>
      </div>)}
    </div>
    {onSelectDate && <div className={styles.daySummary} aria-live="polite" aria-atomic="true"><span>{(selectedDate ?? today).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</span><strong>{`Занятия: ${selectedSummary.lessons ?? "недоступны"}, задачи: ${selectedSummary.tasks ?? "недоступны"}`}</strong><p>Выберите день, чтобы увидеть его занятия и задачи в обзоре.</p></div>}
  </div>;
};

export default Calendar;
