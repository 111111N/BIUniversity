import { useId, useRef, useState } from "react";
import type { BackupDifference } from "../../data/localBackupInspectionService";
import Tabs from "../../components/Tabs";
import SearchField from "../../components/SearchField";
import { BACKUP_DIFFERENCE_LABELS, changeBackupDifferenceQuery, emptyBackupDifferenceQuery, getBackupDifferencePage, type BackupDifferenceQuery } from "./backupDifferenceView";
import { useReviewPaginationFocus } from "./useReviewPaginationFocus";
import styles from "./index.module.scss";

export default function DifferenceReview({ differences }: { differences: readonly BackupDifference[] }) {
  const [query, setQuery] = useState(emptyBackupDifferenceQuery);
  const areaId = useId(); const searchRoot = useRef<HTMLDivElement>(null); const list = useRef<HTMLUListElement>(null);
  const view = getBackupDifferencePage(differences, query);
  const areas = [...new Set(differences.map((item) => item.area))];
  const paginationFocus = useReviewPaginationFocus(differences);
  const update = (patch: Partial<Omit<BackupDifferenceQuery, "page">>) => { paginationFocus.cancel(); setQuery((current) => changeBackupDifferenceQuery(current, patch)); };
  const reset = () => { paginationFocus.cancel(); setQuery(emptyBackupDifferenceQuery()); searchRoot.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(); };
  const turnPage = (page: number, button: HTMLButtonElement) => { setQuery((current) => ({ ...current, page })); paginationFocus.request(button, list.current); };
  if (!differences.length) return <p className={styles.hint}>Различий в проверенных сохранённых записях и структуре хранилищ не найдено.</p>;
  return <div className={styles.differenceReview}>
    <Tabs variant="filter" className={styles.issueTabs} ariaLabel="Тип различий с браузером" value={query.kind} onChange={(kind) => update({ kind: kind as BackupDifferenceQuery["kind"] })} items={[{ value: "all", label: "Все", count: differences.length }, ...Object.entries(BACKUP_DIFFERENCE_LABELS).map(([kind, label]) => ({ value: kind, label, count: differences.filter((item) => item.kind === kind).length }))]} />
    <div className={styles.issueFilters}>
      <div className={styles.issueArea}><label htmlFor={areaId}>Область сравнения</label><select id={areaId} value={query.area === null ? "" : String(areas.indexOf(query.area))} onChange={(event) => update({ area: event.target.value === "" ? null : areas[Number(event.target.value)] ?? null })}><option value="">Все области</option>{areas.map((area, index) => <option key={area} value={index}>{area}</option>)}</select></div>
      <div ref={searchRoot}><SearchField label="Найти различие по области или ID" placeholder="" value={query.search} onChange={(search) => update({ search })} /></div>
    </div>
    <div className={styles.issueResult}><p role="status" aria-live="polite">Найдено: {view.total} из {differences.length}</p>{(query.kind !== "all" || query.area !== null || query.search !== "") && <button type="button" onClick={reset}>Сбросить фильтры</button>}</div>
    <p className={styles.hint}>Фильтры меняют только этот список. Итоги сравнения и полный JSON-отчёт содержат все различия.</p>
    <ul ref={list} tabIndex={-1} className={styles.differences} aria-label="Различия с текущими данными">{view.rows.map((item) => <li key={JSON.stringify([item.area, item.id, item.kind])}><div><strong>{BACKUP_DIFFERENCE_LABELS[item.kind]}</strong><span>{item.area}</span></div><code>{item.id}</code></li>)}</ul>
    {!view.total && <p className={styles.hint}>Различия по выбранным условиям не найдены. Измените поиск или сбросьте фильтры.</p>}
    {view.pages > 1 && <div className={styles.pagination}><span>Страница {view.page} из {view.pages} · различий {view.total}</span><div><button type="button" disabled={view.page === 1} onClick={(event) => turnPage(view.page - 1, event.currentTarget)}>Назад</button><button type="button" disabled={view.page === view.pages} onClick={(event) => turnPage(view.page + 1, event.currentTarget)}>Далее</button></div></div>}
  </div>;
}
