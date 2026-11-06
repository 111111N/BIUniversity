import { useId } from "react";
import type { AssessmentRecordBookMetadata } from "../../domain/assessmentTypes";
import Dropdown from "../../components/Dropdown";
import styles from "./index.module.scss";

export interface RecordBookDraft { semester: string; hours: string; category: "required" | "elective" }
export const recordBookDraft = (value: AssessmentRecordBookMetadata | null): RecordBookDraft => ({ semester: value ? String(value.semester) : "", hours: value ? String(value.hours) : "", category: value?.category ?? "required" });
export const parseRecordBookDraft = (value: RecordBookDraft): AssessmentRecordBookMetadata | null => /^\d+$/.test(value.semester) && Number(value.semester) >= 1 && Number(value.semester) <= 99 && /^\d+$/.test(value.hours) && Number(value.hours) <= 100_000
  ? { semester: Number(value.semester), hours: Number(value.hours), category: value.category } : null;

export default function RecordBookFields({ value, onChange, disabled }: { value: RecordBookDraft; onChange(value: RecordBookDraft): void; disabled: boolean }) {
  const prefix = useId();
  return <fieldset className={styles.plainFieldset} disabled={disabled}><legend>Сведения для зачётки</legend><div className={styles.fields}>
    <label className={styles.field} htmlFor={`${prefix}-semester`}>Семестр<input id={`${prefix}-semester`} type="number" inputMode="numeric" required min={1} max={99} step={1} value={value.semester} onChange={(event) => onChange({ ...value, semester: event.target.value })} /><small>Порядковый номер за всё обучение: 1, 2, 3…</small></label>
    <label className={styles.field} htmlFor={`${prefix}-hours`}>Часы дисциплины<input id={`${prefix}-hours`} type="number" inputMode="numeric" required min={0} max={100000} step={1} value={value.hours} onChange={(event) => onChange({ ...value, hours: event.target.value })} /></label>
    <Dropdown label="Раздел зачётки" value={value.category} disabled={disabled} options={[{ value: "required", label: "Основная программа" }, { value: "elective", label: "Факультатив" }]} onChange={(category) => onChange({ ...value, category: category as RecordBookDraft["category"] })} />
  </div></fieldset>;
}
