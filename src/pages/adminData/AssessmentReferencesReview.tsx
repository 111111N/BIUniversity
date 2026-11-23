import { useState } from "react";
import { ASSESSMENT_REFERENCE_LABELS, type AssessmentReferenceReview } from "../../domain/backupAssessmentReferences";
import { matchesSearchText } from "../../domain/search";
import Dropdown from "../../components/Dropdown";
import SearchField from "../../components/SearchField";
import BaseSourcesReview from "./BaseSourcesReview";
import styles from "./index.module.scss";

export default function AssessmentReferencesReview({ review }: { review: AssessmentReferenceReview }) {
  const [target, setTarget] = useState("all"), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const label = (value?: keyof typeof ASSESSMENT_REFERENCE_LABELS) => value ? ASSESSMENT_REFERENCE_LABELS[value] : "Выбор источников";
  const findings = review.issues.map((issue, index) => ({ issue, index })).filter(({ issue }) => (target === "all" || (issue.target ?? "selection") === target) && matchesSearchText(`${label(issue.target)} ${issue.referenceId ?? ""} ${issue.message}`, query));
  const pages = Math.max(1, Math.ceil(findings.length / 20)), current = Math.min(page, pages);
  return <section aria-label="Ссылки выбранных аттестаций">
    <p>{review.status === "references-present" ? "Связанные ID найдены в выбранных полных источниках." : "Есть непроверенные ссылки на справочники."}</p>
    <p className={styles.hint}>Найдено ссылок: {review.counts.found} из {review.counts.references}. Отсутствуют: {review.counts.missing}. Требуют согласования: {review.counts.unresolved}. Без доступного справочника: {review.counts.unavailable}.</p>
    {review.baseSources && review.baseSources.length > 0 && <BaseSourcesReview reviews={review.baseSources} />}
    {review.issues.length > 0 && <>
      <div className={styles.issueFilters}>
        <Dropdown label="Источник замечаний" value={target} options={[{ value: "all", label: "Все источники" }, ...Object.entries(ASSESSMENT_REFERENCE_LABELS).map(([value, label]) => ({ value, label })), { value: "selection", label: "Выбор источников" }]} onChange={value => { setTarget(value); setPage(1); }} />
        <SearchField label="Найти замечание по тексту или ID" value={query} onChange={value => { setQuery(value.slice(0, 256)); setPage(1); }} />
      </div>
      <p className={styles.hint} role="status">Замечаний: {findings.length} из {review.issues.length}</p>
      <ul className={styles.documentIssues}>{findings.slice((current - 1) * 20, current * 20).map(({ issue, index }) => <li key={index}>
        <strong>{label(issue.target)}</strong><p>{issue.message}</p>{issue.referenceId && <code>{issue.referenceId}</code>}
      </li>)}</ul>
      {!findings.length && <p className={styles.hint}>По выбранным условиям замечаний нет.</p>}
      {pages > 1 && <nav className={styles.actions} aria-label="Страницы замечаний к ссылкам аттестаций"><button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>Назад</button><span>{current} / {pages}</span><button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>Далее</button></nav>}
    </>}
    <p className={styles.hint}>Сверяются точные ID с полными источниками и сохранённые снимки периодов. Исторические роли, состав групп на дату сдачи и остальные зависимости требуют отдельного подтверждения. Восстановление не разрешено.</p>
  </section>;
}
