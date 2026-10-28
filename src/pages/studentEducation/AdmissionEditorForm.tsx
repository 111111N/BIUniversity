import { useEffect, useRef, useState, type FormEvent } from "react";
import EducationEventFields from "../../components/EducationEventFields";
import { RecordEditorActions } from "../../components/RecordEditor";
import { getEducationDetailsErrors, type EducationEventDetails } from "../../domain/studentEducationEvent";
import styles from "./AdmissionEditorForm.module.scss";

interface Props {
  value: EducationEventDetails; disabled: boolean; stale: boolean; busy: boolean;
  restriction?: string; focusRequest?: number;
  onRefresh(): void;
  onChange(value: EducationEventDetails): void; onSubmit(event: FormEvent): void; onCancel(): void;
}
export default function AdmissionEditorForm({ value, disabled, stale, busy, restriction = "", focusRequest = 0, onRefresh, onChange, onSubmit, onCancel }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (focusRequest) formRef.current?.querySelector<HTMLElement>('button[aria-haspopup="dialog"]')?.focus(); }, [focusRequest]);
  const problems = getEducationDetailsErrors(value, new Date().toISOString());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || stale || busy || restriction) return;
    setSubmitted(true);
    if (problems.length) {
      requestAnimationFrame(() => {
        const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], button[data-invalid="true"]');
        const disclosure = field?.closest("details");
        if (disclosure) disclosure.open = true;
        field?.focus();
      });
      return;
    }
    onSubmit(event);
  };
  const hint = busy ? "Сохраняем событие зачисления…" : disabled ? "Сначала восстановите чтение данных кнопкой «Повторить чтение»." : stale ? "Сведения изменились. Обновите проверку; дата, основание и документ сохранятся." : restriction || "Дата создания учётки не заменяет дату зачисления. После сохранения ранние события между уже внесёнными не вставляются.";
  return <form ref={formRef} className={styles.form} aria-label="Подтверждение зачисления" noValidate onSubmit={submit}>
    {submitted && problems.length > 0 && <p role="alert" className={styles.summaryError}>Проверьте отмеченные поля. Зачисление ещё не сохранено.</p>}
    <EducationEventFields value={value} onChange={onChange} disabled={disabled || busy} showErrors={submitted} />
    {stale && !disabled && !busy && <div role="alert" className={styles.sourceNotice}><p>{hint}</p><button type="button" onClick={onRefresh}>Обновить проверку</button></div>}
    <RecordEditorActions label="Сохранить зачисление" disabled={disabled || stale || busy || Boolean(restriction)} busy={busy} onCancel={onCancel} hint={stale && !disabled && !busy ? undefined : hint} />
  </form>;
}
