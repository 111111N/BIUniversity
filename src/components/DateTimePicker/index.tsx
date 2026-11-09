import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addDays,
  addMonths,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ru } from "date-fns/locale";
import { getCalendarMonthDays, getDayInMonth } from "../../domain/calendar";
import ArrowButton from "../ArrowButton";
import CancelButton from "../CancelButton";
import TimeWheel from "../TimeWheel";
import styles from "./index.module.scss";
import { formatPickerDateText, formatPickerTimeText, parsePickerDateText, parsePickerTimeText } from "./manualInput";

const WEEK_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

interface DateTimePickerProps {
  value?: Date;
  initialDate?: Date;
  onChange(value?: Date): void;
  placeholder?: string;
  ariaLabel?: string;
  showTime?: boolean;
  allowClear?: boolean;
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}

const DateTimePicker = ({ value, initialDate, onChange, placeholder = "Выберите дату", ariaLabel = "Дата и время", showTime = true, allowClear = true, id, describedBy, invalid, disabled = false }: DateTimePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const dialogId = useId();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(value ?? initialDate ?? new Date()));
  const [focusedDay, setFocusedDay] = useState(() => value ?? initialDate ?? new Date());
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [time, setTime] = useState(() => ({ hours: value?.getHours() ?? 9, minutes: value?.getMinutes() ?? 0 }));
  const [dateText, setDateText] = useState(() => formatPickerDateText(value));
  const [timeText, setTimeText] = useState(() => formatPickerTimeText(value?.getHours() ?? 9, value?.getMinutes() ?? 0));
  const [dateError, setDateError] = useState("");
  const [timeError, setTimeError] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const selectedTimestamp = value?.getTime();
  const openingTime = useRef(time);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  useEffect(() => { if (disabled) setIsOpen(false); }, [disabled]);
  useEffect(() => {
    if (!isOpen) return;
    const selected = selectedTimestamp === undefined ? undefined : new Date(selectedTimestamp);
    setDraftValue(selected);
    setDateText(formatPickerDateText(selected));
    if (selected) {
      setTime({ hours: selected.getHours(), minutes: selected.getMinutes() });
      setTimeText(formatPickerTimeText(selected.getHours(), selected.getMinutes()));
      setFocusedDay(selected);
      setVisibleMonth(startOfMonth(selected));
    }
    setDateError("");
    setTimeError("");
  }, [selectedTimestamp, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !popoverRef.current?.contains(event.target as Node)) {
        setTime(openingTime.current);
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      if (popoverRef.current?.contains(document.activeElement) && document.activeElement?.matches("input")) return;
      popoverRef.current?.querySelector<HTMLElement>('[data-focused="true"], [data-selected-period="true"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, view]);

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };
  const cancelSelection = () => {
    setTime(openingTime.current);
    setDateError(""); setTimeError("");
    close();
  };
  const clearSelection = () => {
    try {
      onChange(undefined);
      setIsOpen(false); setDateText(""); setDateError(""); setTimeError("");
      triggerRef.current?.focus({ preventScroll: true });
    } catch (error) {
      console.error("Не удалось очистить дату и время:", error);
      setDateError("Не удалось очистить дату. Попробуйте ещё раз.");
      setIsOpen(true);
    }
  };

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !popoverRef.current) return;
    const placePopover = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const popover = popoverRef.current?.getBoundingClientRect();
      if (!trigger || !popover) return;
      const gap = 7;
      const viewportPadding = 10;
      const fitsBelow = window.innerHeight - trigger.bottom >= popover.height + gap;
      const preferredTop = fitsBelow
        ? trigger.bottom + gap
        : trigger.top - popover.height - gap;
      const top = Math.max(viewportPadding, Math.min(preferredTop, window.innerHeight - popover.height - viewportPadding));
      const left = Math.max(
        viewportPadding,
        Math.min(trigger.left, window.innerWidth - popover.width - viewportPadding),
      );
      setPopoverPosition((current) => current.top === top && current.left === left ? current : { top, left });
    };
    placePopover();
    const observer = new ResizeObserver(placePopover);
    observer.observe(popoverRef.current);
    window.addEventListener("resize", placePopover);
    window.addEventListener("scroll", placePopover, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", placePopover);
      window.removeEventListener("scroll", placePopover, true);
    };
  }, [isOpen, visibleMonth, view, showTime]);

  const calendarDays = useMemo(() => getCalendarMonthDays(visibleMonth), [visibleMonth]);
  const changeMonth = (month: Date) => {
    setVisibleMonth(startOfMonth(month));
    setFocusedDay(getDayInMonth(focusedDay, month));
  };
  const navigatePeriod = (direction: number) => changeMonth(view === "days"
    ? addMonths(visibleMonth, direction)
    : new Date(visibleMonth.getFullYear() + direction * (view === "years" ? 12 : 1), visibleMonth.getMonth(), 1));

  const selectDay = (day: Date, closeAfterSelection = true) => {
    if (disabled) return;
    setFocusedDay(day);
    if (!isSameMonth(day, visibleMonth)) setVisibleMonth(startOfMonth(day));
    const next = new Date(day);
    next.setHours(showTime ? time.hours : 0, showTime ? time.minutes : 0, 0, 0);
    setDateText(formatPickerDateText(next));
    setDateError("");
    setDraftValue(next);
    if (!showTime && closeAfterSelection) {
      try {
        if (next.getTime() !== value?.getTime()) onChange(next);
        close();
      } catch (error) {
        console.error("Не удалось выбрать день в календаре:", error);
        setDateError("Не удалось изменить дату. Попробуйте ещё раз.");
      }
    }
  };

  const changeTime = (hours: number, minutes: number) => {
    if (disabled) return;
    setTime({ hours, minutes });
    setTimeText(formatPickerTimeText(hours, minutes));
    setTimeError("");
    if (!draftValue) return;
    const next = new Date(draftValue);
    next.setHours(hours, minutes, 0, 0);
    setDraftValue(next);
  };

  const applyDateText = (text: string, reportError = false) => {
    const date = parsePickerDateText(text);
    if (!date) {
      if (reportError || text.length >= 10) setDateError("Введите существующую дату: дд.мм.гггг");
      return false;
    }
    try { selectDay(date, false); setView("days"); return true; }
    catch (error) { console.error("Не удалось применить введённую дату:", error); setDateError("Не удалось изменить дату."); return false; }
  };
  const applyTimeText = (text: string, reportError = false) => {
    const parsed = parsePickerTimeText(text);
    if (!parsed) {
      if (reportError || text.length >= 5) setTimeError("Введите время от 00:00 до 23:59");
      return false;
    }
    try { changeTime(parsed.hours, parsed.minutes); return true; }
    catch (error) { console.error("Не удалось применить введённое время:", error); setTimeError("Не удалось изменить время."); return false; }
  };
  const finish = () => {
    if ((dateText || draftValue) && !parsePickerDateText(dateText)) { setDateError("Введите существующую дату: дд.мм.гггг"); dateInputRef.current?.focus(); return; }
    if (showTime && !parsePickerTimeText(timeText)) { setTimeError("Введите время от 00:00 до 23:59"); timeInputRef.current?.focus(); return; }
    try {
      if (draftValue?.getTime() !== value?.getTime()) onChange(draftValue);
      close();
    } catch (error) {
      console.error("Не удалось применить дату и время:", error);
      setDateError("Не удалось изменить дату. Попробуйте ещё раз.");
    }
  };

  return (
    <div className={styles.picker} ref={rootRef}>
      <div className={styles.triggerWrapper}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ""} ${value && allowClear ? styles.triggerClearable : ""}`}
        onKeyDown={(event) => {
          if (!isOpen || event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          cancelSelection();
        }}
        onClick={() => {
          if (isOpen) { cancelSelection(); return; }
          openingTime.current = { hours: value?.getHours() ?? time.hours, minutes: value?.getMinutes() ?? time.minutes };
          setDraftValue(value ? new Date(value) : undefined);
          setVisibleMonth(startOfMonth(value ?? initialDate ?? new Date()));
          setFocusedDay(value ?? initialDate ?? new Date());
          setTime({ hours: value?.getHours() ?? time.hours, minutes: value?.getMinutes() ?? time.minutes });
          setDateText(formatPickerDateText(value));
          setTimeText(formatPickerTimeText(value?.getHours() ?? time.hours, value?.getMinutes() ?? time.minutes));
          setDateError(""); setTimeError("");
          setView("days");
          setIsOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label={`${ariaLabel}: ${value ? format(value, showTime ? "d MMMM yyyy, HH:mm" : "d MMMM yyyy", { locale: ru }) : placeholder}`}
        aria-expanded={isOpen && !disabled}
        aria-controls={isOpen && !disabled ? dialogId : undefined}
        aria-describedby={describedBy}
        data-invalid={invalid || undefined}
        disabled={disabled}
      >
        <span className={value ? styles.triggerValue : styles.placeholder}>
          {value ? format(value, showTime ? "d MMMM yyyy, HH:mm" : "d MMMM yyyy", { locale: ru }) : placeholder}
        </span>
        <span className={styles.calendarIcon} aria-hidden="true" />
      </button>
      {value && allowClear && <button type="button" className={styles.clearValue} disabled={disabled} aria-label={`Очистить: ${ariaLabel.toLowerCase()}`} onClick={clearSelection}>×</button>}
      </div>

      {isOpen && !disabled && createPortal(
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- The dialog owns Escape and focus containment for its keyboard controls.
        <div
          id={dialogId}
          ref={popoverRef}
          className={`${styles.popover} ${!showTime ? styles.dateOnly : ""}`}
          style={popoverPosition}
          role="dialog"
          aria-label={`Выбор: ${ariaLabel.toLowerCase()}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              cancelSelection();
            }
            if (event.key !== "Tab") return;
            const focusable = Array.from(popoverRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]') ?? [])
              .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }}
        >
          <header className={styles.calendarHeader}>
            <ArrowButton onClick={() => navigatePeriod(-1)} label="Предыдущий период" direction="left" />
            <div className={styles.periodSelector} aria-live="polite">{view === "days" && <button type="button" onClick={() => setView("months")}>{format(visibleMonth, "LLLL", { locale: ru })}</button>}<button type="button" onClick={() => setView("years")}>{view === "years" ? `${visibleMonth.getFullYear() - 5}–${visibleMonth.getFullYear() + 6}` : visibleMonth.getFullYear()}</button></div>
            <ArrowButton onClick={() => navigatePeriod(1)} label="Следующий период" />
          </header>

          <div className={styles.pickerBody}><div className={styles.calendarBody}>{view === "days" && <><div className={styles.weekDays}>
            {WEEK_DAYS.map((day) => <span key={day}>{day}</span>)}
          </div>

          <div className={styles.daysGrid}>
            {calendarDays.map((day) => {
              const selected = Boolean(draftValue && isSameDay(day, draftValue));
              const today = isSameDay(day, new Date());
              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  className={`${styles.day} ${!isSameMonth(day, visibleMonth) ? styles.outsideDay : ""} ${today ? styles.today : ""} ${selected ? styles.selectedDay : ""}`}
                  onClick={() => selectDay(day)}
                  tabIndex={isSameDay(day, focusedDay) ? 0 : -1}
                  onFocus={() => setFocusedDay(day)}
                  onKeyDown={(event) => {
                    const offsets: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
                    const offset = offsets[event.key];
                    let next: Date;
                    if (offset !== undefined) next = addDays(day, offset);
                    else if (event.key === "Home") next = startOfWeek(day, { weekStartsOn: 1 });
                    else if (event.key === "End") next = endOfWeek(day, { weekStartsOn: 1 });
                    else if (event.key === "PageUp" || event.key === "PageDown") next = getDayInMonth(day, addMonths(day, (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1)));
                    else return;
                    event.preventDefault();
                    setFocusedDay(next);
                    if (!isSameMonth(next, visibleMonth)) setVisibleMonth(startOfMonth(next));
                    requestAnimationFrame(() => popoverRef.current?.querySelector<HTMLElement>(`[data-date="${format(next, "yyyy-MM-dd")}"]`)?.focus());
                  }}
                  aria-pressed={selected}
                  aria-current={today ? "date" : undefined}
                  aria-label={format(day, "EEEE, d MMMM yyyy", { locale: ru })}
                  data-calendar-day="true"
                  data-focused={isSameDay(day, focusedDay) ? "true" : undefined}
                  data-selected={selected ? "true" : undefined}
                  data-date={format(day, "yyyy-MM-dd")}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div></>}
          {view === "months" && <div className={styles.monthsGrid}>{MONTHS.map((month, index) => <button type="button" aria-pressed={index === visibleMonth.getMonth()} data-selected-period={index === visibleMonth.getMonth() ? "true" : undefined} className={index === visibleMonth.getMonth() ? styles.selectedPeriod : ""} key={month} onClick={() => { changeMonth(new Date(visibleMonth.getFullYear(), index, 1)); setView("days"); }}>{month}</button>)}</div>}
          {view === "years" && <div className={styles.yearsGrid}>{Array.from({ length: 12 }, (_, index) => visibleMonth.getFullYear() - 5 + index).map((year) => <button type="button" aria-pressed={year === visibleMonth.getFullYear()} data-selected-period={year === visibleMonth.getFullYear() ? "true" : undefined} className={year === visibleMonth.getFullYear() ? styles.selectedPeriod : ""} key={year} onClick={() => { changeMonth(new Date(year, visibleMonth.getMonth(), 1)); setView("months"); }}>{year}</button>)}</div>}</div>{showTime && <TimeWheel hours={time.hours} minutes={time.minutes} onChange={changeTime} />}</div>

          <footer className={styles.footer}>
            <div className={styles.manualFields}>
              <label className={styles.manualField}>
                <span className={styles.srOnly}>Дата вручную</span>
                <svg className={styles.manualIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 11h18" /></svg>
                <input ref={dateInputRef} type="text" inputMode="numeric" value={dateText} placeholder="дд.мм.гггг" maxLength={10} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? `${dialogId}-date-error` : undefined} onChange={(event) => { setDateText(event.target.value); setDateError(""); applyDateText(event.target.value); }} onBlur={() => { if (dateText || draftValue) applyDateText(dateText, true); }} onKeyDown={(event) => { if (event.key !== "Enter" || event.ctrlKey || event.metaKey) return; event.preventDefault(); event.stopPropagation(); if (applyDateText(dateText, true)) { if (showTime) timeInputRef.current?.focus(); else finish(); } }} />
              </label>
              {showTime && <label className={styles.manualField}>
                <span className={styles.srOnly}>Время вручную</span>
                <svg className={styles.manualIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <input ref={timeInputRef} type="text" inputMode="numeric" value={timeText} placeholder="чч:мм" maxLength={5} aria-invalid={Boolean(timeError)} aria-describedby={timeError ? `${dialogId}-time-error` : undefined} onChange={(event) => { setTimeText(event.target.value); setTimeError(""); applyTimeText(event.target.value); }} onBlur={() => applyTimeText(timeText, true)} onKeyDown={(event) => { if (event.key !== "Enter" || event.ctrlKey || event.metaKey) return; event.preventDefault(); event.stopPropagation(); if (applyTimeText(timeText, true)) finish(); }} />
              </label>}
            </div>
            <div className={styles.footerActions}>
              <CancelButton size="compact" onClick={cancelSelection} />
              <button type="button" className={styles.doneButton} onClick={finish}>Готово</button>
            </div>
          </footer>
          {dateError && <p className={styles.manualError} id={`${dialogId}-date-error`} role="status">{dateError}</p>}
          {timeError && <p className={styles.manualError} id={`${dialogId}-time-error`} role="status">{timeError}</p>}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default DateTimePicker;
