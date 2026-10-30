import { useId, useRef, useState } from "react";
import { BACKUP_DOCUMENTS, type BackupDocumentKind, type BackupDocumentReview } from "../../domain/localBackupDocuments";
import Tabs from "../../components/Tabs";
import SearchField from "../../components/SearchField";
import { changeDocumentIssueQuery, emptyDocumentIssueQuery, getDocumentIssuePage, type DocumentIssueQuery } from "./documentIssueView";
import { useReviewPaginationFocus } from "./useReviewPaginationFocus";
import styles from "./index.module.scss";

const status = { valid: "Схема прочитана", invalid: "Не читается", absent: "Нет в архиве" };
export default function DocumentReview({ review }: { review: BackupDocumentReview }) {
  const [query, setQuery] = useState(emptyDocumentIssueQuery);
  const areaId = useId(); const searchRoot = useRef<HTMLDivElement>(null); const list = useRef<HTMLUListElement>(null);
  const view = getDocumentIssuePage(review.issues, query);
  const paginationFocus = useReviewPaginationFocus(review);
  const update = (patch: Partial<Omit<DocumentIssueQuery, "page">>) => { paginationFocus.cancel(); setQuery((current) => changeDocumentIssueQuery(current, patch)); };
  const reset = () => { paginationFocus.cancel(); setQuery(emptyDocumentIssueQuery()); searchRoot.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(); };
  const turnPage = (page: number, button: HTMLButtonElement) => { setQuery((current) => ({ ...current, page })); paginationFocus.request(button, list.current); };
  const findings = new Map<BackupDocumentKind, { error: number; review: number }>();
  for (const issue of review.issues) {
    const counts = findings.get(issue.kind) ?? { error: 0, review: 0 };
    counts[issue.level]++;
    findings.set(issue.kind, counts);
  }
  return <section className={styles.documentReview} aria-labelledby="backup-documents-title">
    <h2 id="backup-documents-title">Документы и учебные ссылки</h2>
    <p className={styles.hint}>Проверка схем выполняется по документам внутри архива. Отсутствующие сведения не заменяются текущими данными браузера.</p>
    {(review.counts.errors > 0 || review.counts.reviews > 0) && <p className={review.counts.errors ? styles.error : styles.notice}>Ошибки в данных: {review.counts.errors}. Требуют проверки: {review.counts.reviews}. Для подробностей откройте замечания ниже.</p>}
    <ul className={styles.documentChecks}>{review.checks.map((check) => <li key={check.key}>
      <details className={styles.documentCheck}><summary><strong>{check.label}</strong><span className={check.status === "invalid" ? styles.documentError : styles.documentStatus}>
        {status[check.status]}{check.revision !== undefined ? ` · ревизия ${check.revision}` : ""}{check.documents !== undefined ? ` · списков: ${check.documents}` : ""}{check.records !== undefined ? ` · записей: ${check.records}` : ""}{check.keys !== undefined ? ` · ключей: ${check.keys}` : ""}
        {(findings.get(check.kind)?.error ?? 0) > 0 && <span className={styles.documentError}> · ошибок: {findings.get(check.kind)!.error}</span>}
        {(findings.get(check.kind)?.review ?? 0) > 0 && <span> · проверить: {findings.get(check.kind)!.review}</span>}
      </span></summary>
      <p>{check.message}</p>
      </details>
    </li>)}</ul>
    {review.issues.length > 0 && <details className={styles.details} open><summary>Замечания к документам и связям ({review.counts.errors + review.counts.reviews})</summary><div>
      <Tabs variant="filter" className={styles.issueTabs} ariaLabel="Тип замечаний к архиву" value={query.level} onChange={(level) => update({ level: level as DocumentIssueQuery["level"] })} items={[{ value: "all", label: "Все", count: review.issues.length }, { value: "error", label: "Ошибки", count: review.counts.errors }, { value: "review", label: "Проверить", count: review.counts.reviews }]} />
      <div className={styles.issueFilters}>
        <div className={styles.issueArea}><label htmlFor={areaId}>Область</label><select id={areaId} value={query.area} onChange={(event) => update({ area: event.target.value as DocumentIssueQuery["area"] })}><option value="all">Все области</option>{Object.entries(BACKUP_DOCUMENTS).filter(([kind]) => findings.has(kind as BackupDocumentKind)).map(([kind, definition]) => <option key={kind} value={kind}>{definition.label}</option>)}</select></div>
        <div ref={searchRoot}><SearchField label="Найти замечание по тексту или ID" placeholder="" value={query.search} onChange={(search) => update({ search })} /></div>
      </div>
      <div className={styles.issueResult}><p role="status" aria-live="polite">Найдено: {view.total} из {review.issues.length}</p>{(query.level !== "all" || query.area !== "all" || query.search !== "") && <button type="button" onClick={reset}>Сбросить фильтры</button>}</div>
      <ul ref={list} tabIndex={-1} aria-label="Замечания к архиву" className={styles.documentIssues}>{view.rows.map((issue) => <li key={JSON.stringify([issue.kind, issue.code, issue.referenceId ?? "", issue.recordId ?? ""])}>
        <strong className={issue.level === "error" ? styles.documentError : ""}>{issue.level === "error" ? "Ошибка" : "Не проверено"} · {BACKUP_DOCUMENTS[issue.kind].label}</strong>
        <p>{issue.message}</p>{issue.referenceId && <code>{issue.referenceId}</code>}{issue.recordId && <code>ID записи: {issue.recordId}</code>}
      </li>)}</ul>
      {!view.total && <p className={styles.hint}>Замечания по выбранным условиям не найдены. Измените поиск или сбросьте фильтры.</p>}
      {view.pages > 1 && <div className={styles.pagination}><span>Страница {view.page} из {view.pages}</span><div><button type="button" disabled={view.page === 1} onClick={(event) => turnPage(view.page - 1, event.currentTarget)}>Назад</button><button type="button" disabled={view.page === view.pages} onClick={(event) => turnPage(view.page + 1, event.currentTarget)}>Далее</button></div></div>}
    </div></details>}
    <p className={styles.hint}>Другие локальные записи: {review.counts.unchecked}. Их внутренние схемы ещё не проверены. Сверка материалов, учебных файлов и вложений переписки не подтверждает реальные права участников. Отсутствие замечаний здесь не означает, что архив можно восстановить.</p>
  </section>;
}
