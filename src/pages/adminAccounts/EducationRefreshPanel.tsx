import { useEffect, useRef } from "react";
import { EducationEventSummary, educationDateLabel } from "../../components/EducationEventFields";
import { STUDENT_ENROLLMENT_LABELS } from "../../domain/studentEnrollment";
import { EDUCATION_OPERATIONS } from "./educationOperationModel";
import type { EducationRefreshEditor, EducationRefreshReview } from "./educationRefresh";
import styles from "./AccountDetailsRefreshPanel.module.scss";

interface Props { editor: EducationRefreshEditor; review: EducationRefreshReview; stale: boolean; disabled: boolean; busy: boolean; onContinue(): void; onRefresh(): void; onCancel(): void }
export default function EducationRefreshPanel({ editor, review, stale, disabled, busy, onContinue, onRefresh, onCancel }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  return <section className={styles.panel} aria-label="Повторная проверка учебной операции">
    <h3 ref={headingRef} tabIndex={-1}>Проверьте актуальное обучение</h3>
    <p>Дата, основание и выбранное действие сохраняются. Продолжение вернёт к форме с актуальными данными; событие потребует отдельной проверки и подтверждения.</p>
    <dl className={styles.comparison}><div><dt>Текущая группа</dt><dd><span>При подготовке</span><strong>{review.beforeGroup}</strong></dd><dd><span>Сейчас</span><strong>{review.currentGroup}</strong></dd></div><div><dt>Состояние обучения</dt><dd><span>При подготовке</span><strong>{STUDENT_ENROLLMENT_LABELS[editor.account.enrollmentStatus ?? "studying"]}</strong></dd><dd><span>Сейчас</span><strong>{STUDENT_ENROLLMENT_LABELS[review.latest.enrollmentStatus ?? "studying"]}</strong></dd></div></dl>
    <p>Действие: <strong>{EDUCATION_OPERATIONS[editor.educationOperation].label}</strong>. {editor.educationOperation === "transfer" ? "Выбранная группа" : "Применится к актуальной группе"}: <strong>{review.targetGroup}</strong>.</p>
    <EducationEventSummary value={editor.education} />
    {review.lastEventDate && <p>Последнее событие действует с {educationDateLabel(review.lastEventDate)}.</p>}
    {review.problem && <p className={styles.error} role="status">После обновления исправьте: {review.problem}</p>}
    {stale && <p className={styles.error} role="alert">Данные или права снова изменились. Обновите сравнение; введённые дата и основание сохранены.</p>}
    <div className={styles.actions}><button className={styles.primary} type="button" disabled={disabled || stale} onClick={onContinue}>Продолжить с актуальными данными</button>{stale && <button type="button" disabled={disabled} onClick={onRefresh}>Обновить сравнение</button>}<button type="button" disabled={busy} onClick={onCancel}>К моему вводу</button></div>
  </section>;
}
