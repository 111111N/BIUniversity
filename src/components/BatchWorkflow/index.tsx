import type { ReactNode } from "react";
import styles from "./index.module.scss";

export function WorkflowSteps({ labels, current }: { labels: readonly string[]; current: number }) {
  return <nav className={styles.steps} aria-label="Этапы операции"><ol>{labels.map((label, index) => <li key={label} aria-current={index === current ? "step" : undefined} className={index < current ? styles.completed : ""}><span aria-hidden="true">{index + 1}</span><strong>{label}</strong>{index === current && <small>Этап {index + 1} из {labels.length}</small>}</li>)}</ol></nav>;
}

interface ActionsProps {
  title: string;
  hint: string;
  label: string;
  disabled: boolean;
  onApply(): void;
  children?: ReactNode;
}
export function BatchActionBar({ title, hint, label, disabled, onApply, children }: ActionsProps) {
  return <section className={styles.actions} aria-label="Применение проверенного списка"><div><strong>{title}</strong><p>{hint}</p></div><div className={styles.buttons}>{children}<button type="button" className={styles.primary} disabled={disabled} onClick={onApply}>{label}</button></div></section>;
}
