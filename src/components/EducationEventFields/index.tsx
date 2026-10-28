import { useId, useState } from "react";
import DateTimePicker from "../DateTimePicker";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import { getEducationDetailsErrors, getMoscowDateKey, type EducationEventDetails, type EducationEventField } from "../../domain/studentEducationEvent";
import styles from "./index.module.scss";

export const emptyEducationDetails = (): EducationEventDetails => ({ effectiveDate: getMoscowDateKey(), basis: "" });
export const educationDateLabel = (date: string) => parseCalendarDate(date)?.toLocaleDateString("ru-RU") ?? date;
export function EducationEventSummary({ value }: { value: EducationEventDetails }) {
  return <dl className={styles.summary}><div><dt>Дата действия</dt><dd>{educationDateLabel(value.effectiveDate)}</dd></div><div><dt>Основание</dt><dd>{value.basis}</dd></div>{(value.documentNumber || value.documentDate) && <div><dt>Документ</dt><dd>{[value.documentNumber, value.documentDate ? `от ${educationDateLabel(value.documentDate)}` : ""].filter(Boolean).join(" ")}</dd></div>}</dl>;
}
export default function EducationEventFields({ value, onChange, disabled = false, showErrors = false }: { value: EducationEventDetails; onChange(value: EducationEventDetails): void; disabled?: boolean; showErrors?: boolean }) {
  const id = useId();
  const [touched, setTouched] = useState<Partial<Record<EducationEventField, boolean>>>({});
  const errors = Object.fromEntries(getEducationDetailsErrors(value, new Date().toISOString()).filter((error) => showErrors || touched[error.field]).map((error) => [error.field, error.message]));
  const touch = (field: EducationEventField) => setTouched((previous) => ({ ...previous, [field]: true }));
  const error = (field: EducationEventField) => errors[field] ? <span id={`${id}-${field}-error`} className={styles.fieldError}>{errors[field]}</span> : null;
  const describedBy = (field: EducationEventField, hint = false) => [hint ? `${id}-${field}-hint` : "", errors[field] ? `${id}-${field}-error` : ""].filter(Boolean).join(" ") || undefined;
  return <fieldset className={styles.fields} disabled={disabled}>
    <legend>Событие обучения</legend>
    <div className={styles.date} onBlur={() => touch("effectiveDate")}>
      <label htmlFor={`${id}-effectiveDate`}>Дата действия (обязательно)</label>
      <DateTimePicker id={`${id}-effectiveDate`} describedBy={describedBy("effectiveDate", true)} invalid={Boolean(errors.effectiveDate)} disabled={disabled} showTime={false} allowClear={false} ariaLabel="Дата действия события" value={parseCalendarDate(value.effectiveDate) ?? undefined} onChange={(date) => { touch("effectiveDate"); onChange({ ...value, effectiveDate: date ? toLocalDateKey(date) : "" }); }} />
      {error("effectiveDate")}
    </div>
    <p id={`${id}-effectiveDate-hint`} className={styles.hint}>Сегодня или прошедшая дата, не раньше последнего события студента.</p>
    <div className={styles.basis}>
      <label htmlFor={`${id}-basis`}>Основание (обязательно)</label>
      <textarea id={`${id}-basis`} required minLength={3} maxLength={500} rows={3} aria-invalid={errors.basis ? true : undefined} aria-describedby={describedBy("basis", true)} value={value.basis} onBlur={() => touch("basis")} onChange={(event) => onChange({ ...value, basis: event.target.value })} />
      <span id={`${id}-basis-hint`} className={styles.hint}>От 3 до 500 символов.</span>
      {error("basis")}
    </div>
    <details className={styles.document} open={Boolean(errors.documentNumber || errors.documentDate) || undefined}>
      <summary>Реквизиты документа · необязательно</summary>
      <div>
        <div className={styles.date}>
          <label htmlFor={`${id}-documentNumber`}>Номер документа</label>
          <input id={`${id}-documentNumber`} maxLength={80} value={value.documentNumber ?? ""} aria-invalid={errors.documentNumber ? true : undefined} aria-describedby={describedBy("documentNumber")} onBlur={() => touch("documentNumber")} onChange={(event) => onChange({ ...value, documentNumber: event.target.value })} />
          {error("documentNumber")}
        </div>
        <div className={styles.date} onBlur={() => touch("documentDate")}>
          <label htmlFor={`${id}-documentDate`}>Дата документа</label>
          <DateTimePicker id={`${id}-documentDate`} describedBy={describedBy("documentDate")} invalid={Boolean(errors.documentDate)} disabled={disabled} showTime={false} ariaLabel="Дата документа" placeholder="" value={parseCalendarDate(value.documentDate ?? "") ?? undefined} onChange={(date) => { touch("documentDate"); onChange({ ...value, documentDate: date ? toLocalDateKey(date) : "" }); }} />
          {error("documentDate")}
        </div>
      </div>
    </details>
  </fieldset>;
}
