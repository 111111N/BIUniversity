import { useId, useState, type FormEvent, type RefObject } from "react";
import Dropdown from "../../components/Dropdown";
import { RecordEditorActions } from "../../components/RecordEditor";
import { getGroupDraftErrors, type GroupDraft } from "../../domain/groupCatalog";
import { CAMPUSES } from "../../domain/studentRecord";
import styles from "./GroupDetailsForm.module.scss";

type FieldErrors = Partial<Record<keyof GroupDraft, string>>;
interface FieldsProps { draft: GroupDraft; errors: FieldErrors; disabled: boolean; onChange(draft: GroupDraft): void; onBlur(field: keyof GroupDraft): void }

export function GroupDetailsFields({ draft, errors, disabled, onChange, onBlur }: FieldsProps) {
  const id = useId();
  const input = (field: "name" | "course" | "admissionYear", label: string) => <div className={field === "name" ? styles.name : styles.field}>
    <label htmlFor={`${id}-${field}`}>{label}</label>
    <input id={`${id}-${field}`} required type={field === "name" ? "text" : "number"} min={field === "course" ? 1 : field === "admissionYear" ? 1900 : undefined} max={field === "course" ? 12 : field === "admissionYear" ? 2199 : undefined} step={field === "name" ? undefined : 1} minLength={field === "name" ? 2 : undefined} maxLength={field === "name" ? 80 : undefined} autoComplete="off" value={field === "name" ? draft.name : draft[field] || ""} aria-invalid={errors[field] ? true : undefined} aria-describedby={errors[field] ? `${id}-${field}-error` : undefined} onBlur={() => onBlur(field)} onChange={(event) => onChange({ ...draft, [field]: field === "name" ? event.target.value : Number(event.target.value) })} />
    {errors[field] && <span className={styles.fieldError} id={`${id}-${field}-error`}>{errors[field]}</span>}
  </div>;
  return <fieldset className={styles.fields} disabled={disabled}>
    <legend className={styles.legend}>Реквизиты группы</legend>
    {input("name", "Название группы")}
    {input("course", "Курс")}
    {input("admissionYear", "Год набора")}
    <div className={styles.field} onBlur={() => onBlur("campus")}><Dropdown label="Корпус группы" placeholder="" value={String(draft.campus || "")} options={CAMPUSES} error={errors.campus} disabled={disabled} onChange={(value) => onChange({ ...draft, campus: Number(value) })} /></div>
  </fieldset>;
}

interface Props {
  draft: GroupDraft; editing: boolean; dirty: boolean; disabled: boolean; stale: boolean; busy: boolean;
  formRef: RefObject<HTMLFormElement | null>;
  onChange(draft: GroupDraft): void; onSubmit(event: FormEvent): void; onCancel(): void;
}
export default function GroupDetailsForm({ draft, editing, dirty, disabled, stale, busy, formRef, onChange, onSubmit, onCancel }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof GroupDraft, boolean>>>({});
  const problems = getGroupDraftErrors(draft);
  const errors = Object.fromEntries(problems.filter((problem) => submitted || touched[problem.field]).map((problem) => [problem.field, problem.message]));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || stale || (editing && !dirty)) return;
    setSubmitted(true);
    if (problems.length) { requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    onSubmit(event);
  };
  return <form ref={formRef} aria-label={editing ? "Реквизиты учебной группы" : "Новая учебная группа"} noValidate onSubmit={submit}>
    {submitted && problems.length > 0 && <p className={styles.summaryError} role="alert">Проверьте отмеченные поля. Реквизиты ещё не сохранены.</p>}
    <GroupDetailsFields draft={draft} errors={errors} disabled={disabled} onChange={onChange} onBlur={(field) => setTouched((previous) => ({ ...previous, [field]: true }))} />
    <RecordEditorActions label={editing ? "Сохранить изменения" : "Создать группу"} disabled={disabled || stale || (editing && !dirty)} busy={busy} onCancel={onCancel} hint={stale ? "Сначала обновите проверку изменившихся реквизитов и прав." : editing ? "Изменятся только реквизиты группы." : "Название, курс, год набора и корпус обязательны. После создания можно добавить студентов."} />
  </form>;
}
