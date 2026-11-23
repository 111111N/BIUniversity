import { useState } from "react";
import type { BaseSelectionReview } from "../../domain/backupBaseSelection";
import { matchesSearchText } from "../../domain/search";
import SearchField from "../../components/SearchField";
import Dropdown from "../../components/Dropdown";
import BaseSourcesReview from "./BaseSourcesReview";
import styles from "./index.module.scss";

export default function ListSourcesReview({ reviews, title = "Планировщики, уведомления, журналы и задания", settings = false }: { reviews: readonly BaseSelectionReview[]; title?: string; settings?: boolean }) {
  const [query, setQuery] = useState(""), [status, setStatus] = useState("all"), [page, setPage] = useState(1);
  const rows = reviews.filter(review => (status === "all" || review.status === status) && matchesSearchText(`${review.label} ${review.key} ${review.issues.map(issue => issue.message).join(" ")}`, query));
  const pages = Math.max(1, Math.ceil(rows.length / 20)), current = Math.min(page, pages);
  return <details className={styles.details}><summary>{title} · источников {reviews.length}</summary><div>
    <div className={styles.issueFilters}>
      <SearchField label="Найти источник по ключу или замечанию" value={query} onChange={value => { setQuery(value.slice(0, 256)); setPage(1); }} />
      <Dropdown label="Состояние источника" value={status} options={[{ value: "all", label: "Все" }, { value: "matched", label: "Подтверждены" }, { value: "blocked", label: "Требуют согласования" }, { value: "absent", label: "Отсутствуют" }]} onChange={value => { setStatus(value); setPage(1); }} />
    </div>
    <p className={styles.hint} role="status">Источников: {rows.length} из {reviews.length}</p>
    {rows.length ? <BaseSourcesReview reviews={rows.slice((current - 1) * 20, current * 20)} title={title} settings={settings} showKeys /> : <p>Нет источников по заданным условиям.</p>}
    {pages > 1 && <nav className={styles.actions} aria-label={`Страницы: ${title}`}><button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>Назад</button><span>{current} / {pages}</span><button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>Далее</button></nav>}
  </div></details>;
}
