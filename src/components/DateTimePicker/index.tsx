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
import ArrowCircle from "../ArrowCircle";
import TimeWheel from "../TimeWheel";
import styles from "./index.module.scss";

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
  const dialogId = useId();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(value ?? initialDate ?? new Date()));
  const [focusedDay, setFocusedDay] = useState(() => value ?? initialDate ?? new Date());
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [time, setTime] = useState(() => ({ hours: value?.getHours() ?? 9, minutes: value?.getMinutes() ?? 0 }));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  useEffect(() => { if (disabled) setIsOpen(false); }, [disabled]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !popoverRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      popoverRef.current?.querySelector<HTMLElement>('[data-focused="true"], [data-selected-period="true"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, view]);

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
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

  const selectDay = (day: Date) => {
    if (disabled) return;
    setFocusedDay(day);
    if (!isSameMonth(day, visibleMonth)) setVisibleMonth(startOfMonth(day));
    const next = new Date(day);
    next.setHours(showTime ? time.hours : 0, showTime ? time.minutes : 0, 0, 0);
    onChange(next);
    if (!showTime) close();
  };

  const changeTime = (hours: number, minutes: number) => {
    if (disabled) return;
    setTime({ hours, minutes });
    if (!value) return;
    const next = new Date(value);
    next.setHours(hours, minutes, 0, 0);
    onChange(next);
  };

  return (
    <div className={styles.picker} ref={rootRef}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ""}`}
        onKeyDown={(event) => {
          if (!isOpen || event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
        onClick={() => {
          setVisibleMonth(startOfMonth(value ?? initialDate ?? new Date()));
          setFocusedDay(value ?? initialDate ?? new Date());
          setTime({ hours: value?.getHours() ?? time.hours, minutes: value?.getMinutes() ?? time.minutes });
          setView("days");
          setIsOpen((current) => !current);
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
              close();
            }
            if (event.key !== "Tab") return;
            const focusable = Array.from(popoverRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]') ?? [])
              .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }}
        >
          <header className={styles.calendarHeader}>
            <button type="button" className={styles.arrowButton} onClick={() => navigatePeriod(-1)} aria-label="Предыдущий период">
              <ArrowCircle direction="left" />
            </button>
            <div className={styles.periodSelector} aria-live="polite">{view === "days" && <button type="button" onClick={() => setView("months")}>{format(visibleMonth, "LLLL", { locale: ru })}</button>}<button type="button" onClick={() => setView("years")}>{view === "years" ? `${visibleMonth.getFullYear() - 5}–${visibleMonth.getFullYear() + 6}` : visibleMonth.getFullYear()}</button></div>
            <button type="button" className={styles.arrowButton} onClick={() => navigatePeriod(1)} aria-label="Следующий период">
              <ArrowCircle />
            </button>
          </header>

          <div className={styles.pickerBody}><div className={styles.calendarBody}>{view === "days" && <><div className={styles.weekDays}>
            {WEEK_DAYS.map((day) => <span key={day}>{day}</span>)}
          </div>

          <div className={styles.daysGrid}>
            {calendarDays.map((day) => {
              const selected = Boolean(value && isSameDay(day, value));
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
            <span className={styles.timeHint}>{!showTime ? value ? format(value, "d MMM yyyy", { locale: ru }) : "Выберите день" : value ? `Выбрано ${format(value, "HH:mm")}` : `Время ${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")} · выберите дату`}</span>
            <div className={styles.footerActions}>
              {value && allowClear && <button type="button" className={styles.clearButton} onClick={() => { onChange(undefined); popoverRef.current?.querySelector<HTMLElement>('[data-focused="true"]')?.focus(); }}>Очистить</button>}
              <button type="button" className={styles.doneButton} onClick={close}>Готово</button>
            </div>
          </footer>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default DateTimePicker;
