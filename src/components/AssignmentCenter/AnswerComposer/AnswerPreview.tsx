import type { RefObject } from "react";
import ArrowCircle from "../../ArrowCircle";
import styles from "./index.module.scss";

interface Props {
  headingId: string; headingRef: RefObject<HTMLHeadingElement | null>; text: string; attachment: string;
  busy: boolean; blockedReason?: string; conditionsChanged: boolean; revising: boolean;
  onEdit(): void; onSend(): void;
}

export default function AnswerPreview({ headingId, headingRef, text, attachment, busy, blockedReason, conditionsChanged, revising, onEdit, onSend }: Props) {
  return <div className={styles.preview}>
    <h4 id={headingId} ref={headingRef} tabIndex={-1}>Проверьте перед отправкой</h4>
    <div className={styles.answerText} role="region" aria-labelledby={headingId}>{text}</div>
    <div className={styles.attachment}><span>Вложение</span><strong>{attachment}</strong></div>
    <p className={styles.hint}>После отправки изменить ответ можно только после возврата преподавателем на доработку.</p>
    {conditionsChanged && <p className={styles.error} role="alert">Преподаватель изменил условия или срок задания. Перечитайте их выше, вернитесь к редактированию и проверьте ответ заново. Текст сохранён в форме.</p>}
    <div className={styles.actions}>
      <button type="button" disabled={busy} onClick={onEdit}>{blockedReason ? "К тексту ответа" : "Редактировать"}</button>
      <button type="button" disabled={busy || Boolean(blockedReason) || conditionsChanged} className={styles.primary} onClick={onSend}>{busy ? "Отправляем…" : blockedReason ? "Отправка недоступна" : revising ? "Отправить повторно" : "Отправить преподавателю"}<ArrowCircle /></button>
    </div>
  </div>;
}
