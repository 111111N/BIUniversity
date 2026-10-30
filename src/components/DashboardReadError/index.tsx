import type { RefObject } from "react";
import { retryWithFocusRecovery } from "./retryFocus";
import styles from "./index.module.scss";

interface Props { messages: string[]; onRetry(): void; recoveryTarget?: RefObject<HTMLElement | null> }

export default function DashboardReadError({ messages, onRetry, recoveryTarget }: Props) {
  const errors = [...new Set(messages.filter(Boolean))];
  if (!errors.length) return null;
  return <div className={styles.error} role="alert"><p>{errors.join(" ")} Данные не изменены.</p><button type="button" onClick={(event) => retryWithFocusRecovery(event.currentTarget, recoveryTarget?.current ?? null, onRetry)}>Повторить загрузку</button></div>;
}
