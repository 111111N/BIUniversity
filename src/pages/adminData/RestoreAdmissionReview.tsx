import { useMemo } from "react";
import type { BackupDocumentReview } from "../../domain/localBackupDocuments";
import { assessBackupRestoreAdmission } from "../../domain/backupRestoreAdmission";
import styles from "./index.module.scss";

export default function RestoreAdmissionReview({ review }: { review: BackupDocumentReview }) {
  const admission = useMemo(() => assessBackupRestoreAdmission(review), [review]);
  const blocked = admission.status === "blocked";
  return <section className={styles.documentReview} aria-labelledby="backup-admission-title">
    <h2 id="backup-admission-title">Допуск к восстановлению</h2>
    <div className={styles.notice}>
      <strong>{blocked ? "Восстановление всего архива заблокировано" : "Документы проверены; нужны итоговые проверки"}</strong>
      <p>Если владелец, учебная область или зависимость не подтверждены, восстановить отдельную часть архива нельзя. Сначала нужно устранить все причины блокировки и повторить проверку.</p>
      {blocked && <p>Ошибки: {admission.counts.error}. Не подтверждено: {admission.counts.unconfirmed}. Непроверенные документы: {admission.counts.unchecked}.</p>}
      {admission.counts["incomplete-review"] > 0 && <p className={styles.error}>Результат проверки неполон. Проверьте исходный архив заново.</p>}
      {blocked && <p><a href="#backup-documents-title">Открыть замечания к документам и связям</a></p>}
    </div>
    <details className={styles.details}><summary>Что ещё требуется перед восстановлением</summary><div>
      {admission.remainingChecks.map((message) => <p key={message}>{message}</p>)}
      <p>Этот результат относится к проверкам документов архива. Он не разрешает запись данных и не подтверждает актуальность браузера после проверки.</p>
    </div></details>
  </section>;
}
