import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./index.module.scss";

interface Props {
  title: string;
  context?: string;
  dirty?: boolean;
  busy?: boolean;
  children: ReactNode;
  onClose(): void;
  closeLabel?: string;
}

export default function RecordEditor({ title, context, dirty, busy = false, children, onClose, closeLabel = "К списку" }: Props) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  return <section className={styles.editor} aria-labelledby={titleId}>
    <header className={styles.header}>
      <div><h2 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h2>{context && <p>{context}</p>}{dirty !== undefined && <span className={dirty ? styles.dirty : styles.status}>{dirty ? "Есть несохранённые изменения" : "Нет несохранённых изменений"}</span>}</div>
      <button type="button" disabled={busy} onClick={onClose}>{closeLabel}</button>
    </header>
    <div className={styles.body}>{children}</div>
  </section>;
}

interface ActionsProps {
  label: string;
  disabled: boolean;
  busy: boolean;
  hint?: string;
  onCancel(): void;
}
export function RecordEditorActions({ label, disabled, busy, hint, onCancel }: ActionsProps) {
  return <footer className={styles.actions}>
    {hint && <p>{hint}</p>}
    <div><button type="button" disabled={busy} onClick={onCancel}>Отмена</button><button className={styles.primary} type="submit" disabled={disabled}>{busy ? "Сохраняем…" : label}</button></div>
  </footer>;
}
