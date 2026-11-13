import { ASSESSMENT_REFERENCE_LABELS, type AssessmentReferenceReview } from "../../domain/backupAssessmentReferences";
import { getBackupDifferenceKey, type BackupDifference } from "../../domain/backupComparison";
import DifferenceReview from "./DifferenceReview";
import styles from "./index.module.scss";

export default function AssessmentReferencesReview({ review }: { review: AssessmentReferenceReview }) {
  const differences: BackupDifference[] = review.issues.map(issue => {
    const label = issue.target ? ASSESSMENT_REFERENCE_LABELS[issue.target] : "Справочники";
    return { kind: "schema", area: label, id: issue.referenceId ?? `Справочник: ${label}` };
  });
  const messages = new Map(differences.map((difference, index) => [getBackupDifferenceKey(difference), review.issues[index].message]));
  return <section aria-label="Ссылки выбранных аттестаций">
    <p>{review.status === "references-present" ? "Связанные ID найдены в выбранных карточках справочников." : "Есть непроверенные ссылки на справочники."}</p>
    <p className={styles.hint}>Найдено ссылок: {review.counts.found} из {review.counts.references}. Отсутствуют: {review.counts.missing}. Требуют выбора версии: {review.counts.unresolved}. Без доступного справочника: {review.counts.unavailable}.</p>
    {differences.length > 0 && <DifferenceReview differences={differences} ariaLabel="Замечания к ссылкам выбранных аттестаций" describeDifference={difference => messages.get(getBackupDifferenceKey(difference)) ?? ""} />}
    <p className={styles.hint}>Проверено наличие точных ID. Роли и состав групп на дату сдачи, учебные периоды и согласованность справочников с их историей требуют отдельного подтверждения.</p>
  </section>;
}
