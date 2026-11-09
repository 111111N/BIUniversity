import { useId, useRef, type ReactNode } from "react";
import Modal from "../Modal";
import CancelButton from "../CancelButton";
import styles from "./index.module.scss";

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  intent?: "default" | "discard";
  busy?: boolean;
  busyLabel?: string;
  confirmDisabled?: boolean;
  error?: string;
  onConfirm(): void;
  onCancel(): void;
}

const ConfirmDialog = ({ title, children, confirmLabel = "Удалить", cancelLabel = "Отмена", intent = "default", busy = false, busyLabel = "Выполняем…", confirmDisabled = false, error, onConfirm, onCancel }: Props) => {
  const headingId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancelButton = intent === "discard"
    ? <button ref={cancelRef} className={styles.primary} type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
    : <CancelButton ref={cancelRef} disabled={busy} onClick={onCancel}>{cancelLabel}</CancelButton>;
  const confirmButton = intent === "discard"
    ? <CancelButton disabled={busy || confirmDisabled} onClick={onConfirm}>{busy ? busyLabel : confirmLabel}</CancelButton>
    : <button className={styles.primary} type="button" disabled={busy || confirmDisabled} onClick={onConfirm}>{busy ? busyLabel : confirmLabel}</button>;
  return <Modal labelledBy={headingId} initialFocusRef={cancelRef} layer={3000} onClose={() => { if (!busy) onCancel(); }} className={styles.dialog}>
    <span className={styles.eyebrow}>Подтверждение действия</span>
    <h2 id={headingId}>{title}</h2>
    <div className={styles.content}>{children}</div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>{intent === "discard" ? <>{confirmButton}{cancelButton}</> : <>{cancelButton}{confirmButton}</>}</div>
  </Modal>;
};

export default ConfirmDialog;
