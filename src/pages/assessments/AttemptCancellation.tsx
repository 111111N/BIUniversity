import { useId, useRef, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { assessmentService } from "../../data/assessmentStore";
import type { AssessmentAttempt, AssessmentSnapshot } from "../../domain/assessmentTypes";
import { assessmentContext, assessmentContextChanged, displayDate } from "./model";
import styles from "./index.module.scss";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";

export default function AttemptCancellation({ actorId, assessmentId, attempt, snapshot, blocked, onClose, onSaved }: {
  actorId: string; assessmentId: string; attempt: AssessmentAttempt; snapshot: AssessmentSnapshot; blocked: boolean; onClose(): void; onSaved(): void;
}) {
  const [context] = useState(() => assessmentContext(snapshot, actorId));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const pending = useRef(false);
  useUnsavedChangesWarning(busy);
  const id = useId();
  const stale = assessmentContextChanged(context, snapshot, actorId);
  const available = snapshot.manageableAttemptIds?.includes(attempt.id) === true;
  const cancel = async () => {
    if (pending.current || busy || blocked || stale || !available || reason.trim().length < 2) return;
    pending.current = true;
    setBusy(true); setError("");
    try {
      await assessmentService.execute({ ...context, type: "cancel-attempt", assessmentId, attemptId: attempt.id, reason: reason.trim() });
      onSaved();
    } catch (failure) { console.error("Не удалось отменить попытку аттестации:", failure); setError(failure instanceof Error ? failure.message : "Отмена не сохранена. Повторите попытку."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <ConfirmDialog title="Отменить попытку?" confirmLabel="Отменить попытку" cancelLabel="Вернуться" busy={busy}
    confirmDisabled={blocked || stale || !available || reason.trim().length < 2} error={error || (stale || !available ? "Данные изменились или попытка закрыта. Вернитесь к ведомости и проверьте актуальное состояние." : "")}
    onConfirm={() => void cancel()} onCancel={onClose}>
    <p>Попытка № {attempt.number} · {displayDate(attempt.date)}, {attempt.startsAt} (Москва).</p>
    <p>Назначение и история сохранятся. Внесение результатов будет закрыто; при необходимости можно назначить новую попытку.</p>
    <label className={styles.field} htmlFor={id}>Причина отмены<input id={id} maxLength={500} value={reason} disabled={busy || blocked || stale || !available} onChange={(event) => { setReason(event.target.value); setError(""); }} /></label>
  </ConfirmDialog>;
}
