import { useId, useRef, type ReactNode } from "react";
import Modal from "../Modal";
import styles from "./index.module.scss";

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm(): void;
  onCancel(): void;
}

const ConfirmDialog = ({ title, children, confirmLabel = "Удалить", cancelLabel = "Отмена", busy = false, error, onConfirm, onCancel }: Props) => {
  const headingId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return <Modal labelledBy={headingId} initialFocusRef={cancelRef} layer={3000} onClose={() => { if (!busy) onCancel(); }} className={styles.dialog}>
    <span className={styles.eyebrow}>Подтверждение действия</span>
    <h2 id={headingId}>{title}</h2>
    <div className={styles.content}>{children}</div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}><button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button><button className={styles.danger} type="button" disabled={busy} onClick={onConfirm}>{busy ? "Удаляем…" : confirmLabel}</button></div>
  </Modal>;
};

export default ConfirmDialog;
