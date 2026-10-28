import { useState } from "react";
import { BACKUP_CORE_DOCUMENTS, type BackupDocumentReview } from "../../domain/localBackupDocuments";
import styles from "./index.module.scss";

const status = { valid: "Схема прочитана", invalid: "Не читается", absent: "Нет в архиве" };
export default function DocumentReview({ review }: { review: BackupDocumentReview }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(review.issues.length / 10)); const currentPage = Math.min(page, pages);
  return <section className={styles.documentReview} aria-labelledby="backup-documents-title">
    <h2 id="backup-documents-title">Документы и учебные ссылки</h2>
    <p className={styles.hint}>Проверка схем выполняется по документам внутри архива. Отсутствующие сведения не заменяются текущими данными браузера.</p>
    <ul className={styles.documentChecks}>{review.checks.map((check) => <li key={check.key}>
      <div><strong>{check.label}</strong><span className={check.status === "invalid" ? styles.documentError : styles.documentStatus}>{status[check.status]}{check.revision !== undefined ? ` · ревизия ${check.revision}` : ""}</span></div>
      <p>{check.message}</p>
    </li>)}</ul>
    {(review.counts.errors > 0 || review.counts.reviews > 0) && <p className={review.counts.errors ? styles.error : styles.notice}>Ошибки в данных: {review.counts.errors}. Требуют проверки: {review.counts.reviews}. Для подробностей откройте замечания ниже.</p>}
    {review.issues.length > 0 && <details className={styles.details}><summary>Замечания к документам и связям ({review.counts.errors + review.counts.reviews})</summary><div>
      <ul className={styles.documentIssues}>{review.issues.slice((currentPage - 1) * 10, currentPage * 10).map((issue) => <li key={JSON.stringify([issue.kind, issue.code, issue.referenceId ?? ""])}>
        <strong className={issue.level === "error" ? styles.documentError : ""}>{issue.level === "error" ? "Ошибка" : "Не проверено"} · {BACKUP_CORE_DOCUMENTS[issue.kind].label}</strong>
        <p>{issue.message}</p>{issue.referenceId && <code>{issue.referenceId}</code>}
      </li>)}</ul>
      {pages > 1 && <div className={styles.pagination}><span>Страница {currentPage} из {pages}</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</button><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Далее</button></div></div>}
      {review.counts.hiddenIssues > 0 && <p>Показаны первые {review.issues.length} замечаний. Ещё {review.counts.hiddenIssues} учтены в общих числах. Для большого набора потребуется отдельный полный отчёт.</p>}
    </div></details>}
    <p className={styles.hint}>Другие локальные записи: {review.counts.unchecked}. Их внутренние схемы, владельцы файлов и ссылки вложений ещё не проверены. Отсутствие замечаний здесь не означает, что архив можно восстановить.</p>
  </section>;
}
