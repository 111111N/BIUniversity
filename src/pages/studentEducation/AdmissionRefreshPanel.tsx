import { useEffect, useRef } from "react";
import { ACCOUNT_ROLE_LABELS } from "../../domain/accounts";
import { STUDENT_ENROLLMENT_LABELS } from "../../domain/studentEnrollment";
import { EDUCATION_EVENT_LABELS } from "../../domain/studentEducationEvent";
import { EducationEventSummary, educationDateLabel } from "../../components/EducationEventFields";
import type { AdmissionEditor, AdmissionRefreshReview } from "./admissionRefresh";
import styles from "./AdmissionRefreshPanel.module.scss";

interface Props { editor: AdmissionEditor; review: AdmissionRefreshReview; stale: boolean; disabled: boolean; busy: boolean; onContinue(): void; onRefresh(): void; onCancel(): void }
export default function AdmissionRefreshPanel({ editor, review, stale, disabled, busy, onContinue, onRefresh, onCancel }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const currentState = !review.latest ? "Учётка недоступна" : review.latest.role !== "student" ? ACCOUNT_ROLE_LABELS[review.latest.role] : STUDENT_ENROLLMENT_LABELS[review.latest.enrollmentStatus ?? "studying"];
  return <section className={styles.panel} aria-label="Повторная проверка зачисления">
    <h3 ref={headingRef} tabIndex={-1}>Проверьте актуальные сведения</h3>
    <p>Дата и документ сохранены. Продолжение вернёт к форме; запись зачисления выполняется отдельно.</p>
    <dl className={styles.comparison}>
      <div><dt>Группа</dt><dd><span>При подготовке</span><strong>{editor.groupName}</strong></dd><dd><span>Сейчас</span><strong>{review.currentGroup}</strong></dd></div>
      <div><dt>Обучение</dt><dd><span>При подготовке</span><strong>{STUDENT_ENROLLMENT_LABELS[editor.account.enrollmentStatus ?? "studying"]}</strong></dd><dd><span>Сейчас</span><strong>{currentState}</strong></dd></div>
      <div><dt>Первое событие</dt><dd><span>При подготовке</span><strong>История ещё не начата</strong></dd><dd><span>Сейчас</span><strong>{review.firstEvent ? `${EDUCATION_EVENT_LABELS[review.firstEvent.kind]} · ${educationDateLabel(review.firstEvent.effectiveDate)}` : "История ещё не начата"}</strong></dd></div>
    </dl>
    <EducationEventSummary value={editor.education} />
    {review.restriction && <p className={styles.error} role="status">{review.restriction} Подтверждение зачисления недоступно; документ остаётся в форме.</p>}
    {!review.restriction && review.fieldProblem && <p>После возврата к форме исправьте: {review.fieldProblem}</p>}
    {stale && <p className={styles.error} role="alert">Сведения или права снова изменились. Обновите сравнение перед продолжением.</p>}
    <div className={styles.actions}>
      <button className={styles.primary} type="button" disabled={disabled || stale || Boolean(review.restriction)} onClick={onContinue}>Продолжить с актуальными данными</button>
      {stale && <button type="button" disabled={disabled} onClick={onRefresh}>Обновить сравнение</button>}
      <button type="button" disabled={busy} onClick={onCancel}>К моему вводу</button>
    </div>
  </section>;
}
