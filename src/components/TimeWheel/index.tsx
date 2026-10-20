import { useEffect, useId, useRef } from "react";
import styles from "./index.module.scss";

const ITEM_HEIGHT = 38;

interface TimeColumnProps {
  label: string;
  max: number;
  value: number;
  onChange(value: number): void;
}

const TimeColumn = ({ label, max, value, onChange }: TimeColumnProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const optionId = useId();
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ value, onChange });
  const values = Array.from({ length: max + 1 }, (_, index) => index);

  useEffect(() => { latest.current = { value, onChange }; }, [value, onChange]);

  useEffect(() => {
    const target = value * ITEM_HEIGHT;
    if (ref.current && Math.abs(ref.current.scrollTop - target) > 1) ref.current.scrollTo({ top: target });
  }, [value]);

  useEffect(() => () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
  }, []);

  const selectFromScroll = () => {
    if (!ref.current) return;
    const next = Math.max(0, Math.min(max, Math.round(ref.current.scrollTop / ITEM_HEIGHT)));
    if (next !== latest.current.value) latest.current.onChange(next);
  };

  const move = (direction: number) => onChange(Math.max(0, Math.min(max, value + direction)));

  return <div className={styles.columnWrap}>
    <span className={styles.columnLabel}>{label}</span>
    <div
      ref={ref}
      className={styles.column}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${optionId}-${value}`}
      onScroll={() => {
        if (scrollTimer.current) clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(selectFromScroll, 70);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
        if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
        if (event.key === "PageDown") { event.preventDefault(); move(5); }
        if (event.key === "PageUp") { event.preventDefault(); move(-5); }
        if (event.key === "Home") { event.preventDefault(); onChange(0); }
        if (event.key === "End") { event.preventDefault(); onChange(max); }
      }}
    >
      {values.map((item) => <button id={`${optionId}-${item}`} tabIndex={-1} type="button" role="option" aria-selected={item === value} className={item === value ? styles.selected : ""} key={item} onClick={() => { onChange(item); ref.current?.focus({ preventScroll: true }); }}>{String(item).padStart(2, "0")}</button>)}
    </div>
  </div>;
};

interface TimeWheelProps {
  hours: number;
  minutes: number;
  onChange(hours: number, minutes: number): void;
}

const TimeWheel = ({ hours, minutes, onChange }: TimeWheelProps) => <div className={styles.timeWheel} aria-label="Выбор времени">
  <div className={styles.selectedRail} aria-hidden="true" />
  <TimeColumn label="Часы" max={23} value={hours} onChange={(next) => onChange(next, minutes)} />
  <span className={styles.separator}>:</span>
  <TimeColumn label="Минуты" max={59} value={minutes} onChange={(next) => onChange(hours, next)} />
</div>;

export default TimeWheel;
