import { useId, useMemo, useState, type FormEvent, type RefObject } from "react";
import { RecordEditorActions } from "../../components/RecordEditor";
import { getSubjectDraftErrors, type SubjectDefinition, type SubjectDraft, type SubjectIdentityField } from "../../domain/subjectCatalog";
import styles from "./SubjectCreationForm.module.scss";

type Draft = Pick<SubjectDraft, SubjectIdentityField>;
type FieldErrors = Partial<Record<SubjectIdentityField, string>>;
interface FieldsProps {
  draft: Draft; errors: FieldErrors; disabled: boolean;
  onChange(draft: Draft): void; onBlur(field: SubjectIdentityField): void;
}

export function SubjectCreationFields({ draft, errors, disabled, onChange, onBlur }: FieldsProps) {
  const id = useId();
  const field = (name: SubjectIdentityField, label: string, hint: string) => <div className={name === "name" ? styles.name : styles.field}>
    <label htmlFor={`${id}-${name}`}>{label} <span>(обязательно)</span></label>
    <input id={`${id}-${name}`} name={name} required minLength={name === "name" ? 2 : 1} maxLength={name === "name" ? 160 : 24} autoComplete="off" value={draft[name]} aria-invalid={errors[name] ? true : undefined} aria-describedby={`${id}-${name}-hint${errors[name] ? ` ${id}-${name}-error` : ""}`} onBlur={() => onBlur(name)} onChange={(event) => onChange({ ...draft, [name]: event.target.value })} />
    <span id={`${id}-${name}-hint`} className={styles.hint}>{hint}</span>
    {errors[name] && <span id={`${id}-${name}-error`} className={styles.fieldError}>{errors[name]}</span>}
  </div>;
  return <fieldset className={styles.fields} disabled={disabled}>
    <legend className={styles.legend}>Реквизиты дисциплины</legend>
    {field("name", "Название дисциплины", "Полное название, от 2 до 160 символов.")}
    {field("shortName", "Краткое название", "До 24 символов; используется в компактных карточках.")}
  </fieldset>;
}

interface Props {
  draft: Draft; subjects: SubjectDefinition[]; disabled: boolean; stale: boolean; busy: boolean;
  formRef: RefObject<HTMLFormElement | null>;
  onChange(draft: Draft): void; onSubmit(event: FormEvent): void; onCancel(): void;
}

export default function SubjectCreationForm({ draft, subjects, disabled, stale, busy, formRef, onChange, onSubmit, onCancel }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<SubjectIdentityField, boolean>>>({});
  const problems = useMemo(() => getSubjectDraftErrors(draft, subjects), [draft, subjects]);
  const errors = Object.fromEntries(problems.filter((problem) => submitted || touched[problem.field]).map((problem) => [problem.field, problem.message]));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || stale || busy) return;
    setSubmitted(true);
    if (problems.length) { requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    onSubmit(event);
  };
  const hint = busy ? "Создаём дисциплину…" : disabled ? "Сначала восстановите чтение данных кнопкой «Повторить чтение»." : stale ? "Сначала обновите проверку каталога и прав; введённые поля сохранятся." : "После создания можно назначить преподавателей и группы.";
  return <form ref={formRef} className={styles.form} aria-label="Новая дисциплина" noValidate onSubmit={submit}>
    {submitted && problems.length > 0 && <p className={styles.summaryError} role="alert">Проверьте отмеченные поля. Дисциплина ещё не создана.</p>}
    <SubjectCreationFields draft={draft} errors={errors} disabled={disabled || busy} onChange={onChange} onBlur={(field) => setTouched((previous) => ({ ...previous, [field]: true }))} />
    <RecordEditorActions label="Создать дисциплину" busyLabel="Создаём…" disabled={disabled || stale || busy} busy={busy} onCancel={onCancel} hint={hint} />
  </form>;
}
