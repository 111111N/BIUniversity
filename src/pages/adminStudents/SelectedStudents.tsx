import { useState } from "react";
import type { PortalAccount } from "../../domain/accounts";
import { matchesSearchText } from "../../domain/search";
import SearchField from "../../components/SearchField";
import styles from "./SelectedStudents.module.scss";

const PAGE_SIZE = 8;
export default function SelectedStudents({ selected, accounts, disabled, onRemove }: { selected: ReadonlySet<string>; accounts: ReadonlyMap<string, PortalAccount>; disabled: boolean; onRemove(id: string): void }) {
  const [query, setQuery] = useState(""); const [requestedPage, setPage] = useState(1);
  const effectiveQuery = selected.size > PAGE_SIZE ? query : "";
  const rows = [...selected].map((id) => ({ id, account: accounts.get(id) })).filter(({ account }) => matchesSearchText(`${account?.name ?? "Учётная запись недоступна"} ${account?.login ?? ""} ${account?.studentRecord?.number ?? ""}`, effectiveQuery));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); const page = Math.min(requestedPage, pages);
  return <details className={styles.selected}><summary>Посмотреть выбранных ({selected.size})</summary><div className={styles.body}>
    {selected.size > PAGE_SIZE && <fieldset disabled={disabled}><SearchField label="Поиск среди выбранных студентов" placeholder="" value={query} onChange={(value) => { setQuery(value); setPage(1); }} /></fieldset>}
    <ul>{rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ id, account }) => <li key={id}><div><strong>{account?.name ?? "Учётная запись недоступна"}</strong><span>{account?.login ?? id}</span></div><button type="button" disabled={disabled} onClick={() => onRemove(id)} aria-label={`Снять выбор: ${account?.name ?? id}`}>Убрать</button></li>)}</ul>
    {!rows.length && <p>Среди выбранных ничего не найдено.</p>}
    {pages > 1 && <nav aria-label="Страницы выбранных студентов"><span>{page} / {pages}</span><button type="button" disabled={disabled || page === 1} onClick={() => setPage(page - 1)}>Назад</button><button type="button" disabled={disabled || page === pages} onClick={() => setPage(page + 1)}>Далее</button></nav>}
  </div></details>;
}
