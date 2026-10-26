import { useId } from "react";
import DateTimePicker from "../DateTimePicker";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import { getMoscowDateKey, type EducationEventDetails } from "../../domain/studentEducationEvent";
import styles from "./index.module.scss";

export const emptyEducationDetails = (): EducationEventDetails => ({ effectiveDate: getMoscowDateKey(), basis: "" });
export const educationDateLabel = (date: string) => parseCalendarDate(date)?.toLocaleDateString("ru-RU") ?? date;
export function EducationEventSummary({ value }: { value: EducationEventDetails }) {
  return <dl className={styles.summary}><div><dt>Дата действия</dt><dd>{educationDateLabel(value.effectiveDate)}</dd></div><div><dt>Основание</dt><dd>{value.basis}</dd></div>{(value.documentNumber || value.documentDate) && <div><dt>Документ</dt><dd>{[value.documentNumber, value.documentDate ? `от ${educationDateLabel(value.documentDate)}` : ""].filter(Boolean).join(" ")}</dd></div>}</dl>;
}
export default function EducationEventFields({ value, onChange, disabled = false }: { value: EducationEventDetails; onChange(value: EducationEventDetails): void; disabled?: boolean }) {
  const id = useId();
  return <fieldset className={styles.fields} disabled={disabled}>
    <legend>Событие обучения</legend>
    <div className={styles.date}><span>Дата действия</span><DateTimePicker showTime={false} allowClear={false} ariaLabel="Дата действия события" value={parseCalendarDate(value.effectiveDate) ?? undefined} onChange={(date) => onChange({ ...value, effectiveDate: date ? toLocalDateKey(date) : "" })} /></div>
    <p className={styles.hint}>Сегодня или прошедшая дата. События вносятся по порядку; дата не может быть раньше последнего события студента.</p>
    <label className={styles.basis} htmlFor={`${id}-basis`}>Основание<textarea id={`${id}-basis`} required minLength={3} maxLength={500} rows={3} value={value.basis} onChange={(event) => onChange({ ...value, basis: event.target.value })} /></label>
    <details className={styles.document}><summary>Реквизиты документа · необязательно</summary><div><label htmlFor={`${id}-number`}>Номер документа<input id={`${id}-number`} maxLength={80} value={value.documentNumber ?? ""} onChange={(event) => onChange({ ...value, documentNumber: event.target.value })} /></label><div className={styles.date}><span>Дата документа</span><DateTimePicker showTime={false} ariaLabel="Дата документа" placeholder="" value={parseCalendarDate(value.documentDate ?? "") ?? undefined} onChange={(date) => onChange({ ...value, documentDate: date ? toLocalDateKey(date) : "" })} /></div></div></details>
  </fieldset>;
}
