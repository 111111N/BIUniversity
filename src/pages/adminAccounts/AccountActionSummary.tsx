import type { AccountActionReview } from "./actionReview";
import styles from "./AccountActionSummary.module.scss";

export default function AccountActionSummary({ review }: { review: AccountActionReview }) {
  return <div className={styles.summary}>
    <dl>{review.changes.map((change) => <div key={change.label}><dt>{change.label}</dt><dd><div><span>Было</span><strong>{change.before}</strong></div><div><span>Стало</span><strong>{change.after}</strong></div></dd></div>)}</dl>
    {review.notes.map((note) => <p key={note}>{note}</p>)}
    {review.validationMessage && <p className={styles.error} role="alert">{review.validationMessage}</p>}
  </div>;
}
