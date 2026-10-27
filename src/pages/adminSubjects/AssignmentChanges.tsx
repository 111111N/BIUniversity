import { useState } from "react";
import { getAcademicGroup } from "../../data/academicCatalog";
import { matchesSearchText } from "../../domain/search";
import SearchField from "../../components/SearchField";
import { getAssignmentChanges } from "./assignmentDelta";
import styles from "./AssignmentChanges.module.scss";

const PAGE_SIZE = 8;
export default function AssignmentChanges({ before, after, expanded = false, disabled = false }: { before: string[]; after: string[]; expanded?: boolean; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [requestedPage, setPage] = useState(1);
  const changes = getAssignmentChanges(before, after);
  const effectiveQuery = changes.rows.length > PAGE_SIZE ? query : "";
  const rows = changes.rows.map((row) => ({ ...row, name: getAcademicGroup(row.id)?.name ?? `Группа недоступна (${row.id})` })).filter((row) => matchesSearchText(row.name, effectiveQuery));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  if (!changes.rows.length) return <p className={styles.note}>Изменений назначений пока нет.</p>;
  return <details className={styles.changes} open={expanded || undefined}>
    <summary>Добавится групп: {changes.added.length} · Снимется: {changes.removed.length}</summary>
    <div className={styles.body}>
      {changes.rows.length > PAGE_SIZE && <fieldset disabled={disabled}><SearchField label="Поиск в изменениях групп" value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="" /></fieldset>}
      <ul>{rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((row) => <li key={row.id}><span>{row.name}</span><strong className={row.kind === "removed" ? styles.removed : styles.added}>{row.kind === "removed" ? "Снимется" : "Добавится"}</strong></li>)}</ul>
      {!rows.length && <p className={styles.note}>В изменениях ничего не найдено.</p>}
      {pages > 1 && <nav className={styles.pagination} aria-label="Страницы изменений групп"><span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} из {rows.length}</span><button type="button" disabled={disabled || page === 1} onClick={() => setPage(page - 1)}>Назад</button><button type="button" disabled={disabled || page === pages} onClick={() => setPage(page + 1)}>Далее</button></nav>}
    </div>
  </details>;
}
