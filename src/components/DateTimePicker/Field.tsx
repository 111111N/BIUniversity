import { useId, useState } from "react";
import DateTimePicker from ".";
import { formatPickerTimeText, parsePickerTimeText } from "./manualInput";
import { toLocalDateKey } from "../../domain/schedule";
import styles from "./index.module.scss";

interface Props {
  label: string;
  value: string;
  onChange(value: string): void;
  kind?: "date" | "time";
  id?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  error?: string;
  hint?: string;
  className?: string;
}

// Храним календарную дату и время без преобразования в UTC и сдвига дня.
function calendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01" || value > "9999-12-31") return;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day); date.setHours(12, 0, 0, 0);
  return toLocalDateKey(date) === value ? date : undefined;
}
const TIME_ANCHOR = new Date(2000, 0, 1, 9);

export default function TemporalField({ label, value, onChange, kind = "date", id, required = false, disabled = false, min, max, error, hint, className }: Props) {
  const generatedId = useId(), inputId = id ?? generatedId;
  const [rejectedValue, setRejectedValue] = useState<string | null>(null);
  let selected = kind === "date" ? calendarDate(value) : undefined;
  if (kind === "time") {
    const time = parsePickerTimeText(value);
    if (time) { selected = new Date(TIME_ANCHOR); selected.setHours(time.hours, time.minutes); }
  }
  const constraint = value && !selected ? "Введите корректное значение." : value && (min && value < min || max && value > max) ? "Выберите дату в допустимом диапазоне." : "";
  const message = error || (rejectedValue === value ? constraint || (required && !value ? "Заполните поле." : "") : "");
  const descriptions = [hint ? `${inputId}-hint` : "", message ? `${inputId}-error` : ""].filter(Boolean).join(" ") || undefined;
  return <div className={`${styles.field} ${className ?? ""}`}>
    <label htmlFor={inputId}>{label}</label>
    <DateTimePicker id={inputId} ariaLabel={label} value={selected} initialDate={kind === "time" ? TIME_ANCHOR : calendarDate(min ?? "")}
      showTime={kind === "time"} timeOnly={kind === "time"} allowClear={!required} disabled={disabled} invalid={Boolean(message)} describedBy={descriptions}
      minDate={kind === "date" ? calendarDate(min ?? "0001-01-01") : undefined} maxDate={kind === "date" ? calendarDate(max ?? "9999-12-31") : undefined}
      placeholder={kind === "time" ? "Выберите время" : "Выберите дату"}
      onChange={date => { onChange(date ? kind === "time" ? formatPickerTimeText(date.getHours(), date.getMinutes()) : toLocalDateKey(date) : ""); setRejectedValue(null); }} />
    {/* Текстовое поле сохраняет нативную проверку формы без системного календаря. */}
    <input hidden type="text" tabIndex={-1} aria-hidden="true" value={value} required={required} disabled={disabled} onChange={() => undefined}
      ref={input => { input?.setCustomValidity(constraint); }} onInvalid={event => { event.preventDefault(); setRejectedValue(value); document.getElementById(inputId)?.focus({ preventScroll: true }); }} />
    {hint && <small id={`${inputId}-hint`} className={styles.fieldHint}>{hint}</small>}
    {message && <span id={`${inputId}-error`} className={styles.manualError} role="status">{message}</span>}
  </div>;
}
