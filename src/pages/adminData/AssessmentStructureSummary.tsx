import type { AssessmentSelectionReview } from "../../domain/backupAssessmentSelection";
import styles from "./index.module.scss";

export default function AssessmentStructureSummary({ review }: { review: AssessmentSelectionReview }) {
  const absent = review.issues.some(issue => issue.code === "missing-source");
  return <>
    <p>{absent ? "Аттестации отсутствуют в обоих источниках; пустой документ не создавался." : review.status === "consistent" ? "Выбранные аттестации согласованы со своей историей." : "Выбранный набор аттестаций требует проверки."}</p>
    {review.issues.filter(issue => issue.code !== "missing-source").map(issue => <p key={issue.code}>{issue.message}</p>)}
    {!absent && <p className={styles.hint}>{review.countsComplete ? `Конфликтов: ${review.counts.conflicts}. Без выбора: ${review.counts.unresolved}. Записей только из браузера: ${review.counts.browserOnly}.` : "Проверка всех коллекций не завершена; итоговые счётчики недоступны."}</p>}
    {review.records && <p className={styles.hint}>Аттестаций: {review.records.assessments}. Событий истории: {review.records.history}. Исправлений: {review.records.corrections}. Событий исправлений: {review.records.correctionHistory}. Ревизия проверяемого набора: {review.revisions.candidate}.</p>}
  </>;
}
