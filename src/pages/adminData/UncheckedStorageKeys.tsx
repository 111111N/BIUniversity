import { useRef, useState } from "react";
import SearchField from "../../components/SearchField";
import { emptyUncheckedKeyQuery, getUncheckedKeyPage, searchUncheckedKeys } from "./uncheckedKeyView";
import { useReviewPaginationFocus } from "./useReviewPaginationFocus";
import styles from "./index.module.scss";

export default function UncheckedStorageKeys({ keys, total }: { keys?: readonly string[]; total: number }) {
  const [query, setQuery] = useState(emptyUncheckedKeyQuery);
  const searchRoot = useRef<HTMLDivElement>(null); const list = useRef<HTMLUListElement>(null);
  const paginationFocus = useReviewPaginationFocus(keys);
  if (!total) return null;
  if (!keys || keys.length !== total) return <p className={styles.notice}>Перечень непроверенных ключей не сохранён полностью. Повторите проверку архива, чтобы увидеть все записи.</p>;
  const view = getUncheckedKeyPage(keys, query);
  const update = (search: string) => { paginationFocus.cancel(); setQuery(searchUncheckedKeys(search)); };
  const reset = () => { update(""); searchRoot.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(); };
  const turnPage = (page: number, button: HTMLButtonElement) => { setQuery((current) => ({ ...current, page })); paginationFocus.request(button, list.current); };
  return <details className={styles.details}>
    <summary>Непроверенные локальные ключи ({total})</summary>
    <div>
      <p className={styles.hint}>Показаны только имена ключей. Содержимое этих записей ещё не проверено; они не исключены из исходного архива.</p>
      <div ref={searchRoot}><SearchField label="Найти непроверенный ключ" placeholder="" value={query.search} onChange={update} /></div>
      <div className={styles.issueResult}><p role="status" aria-live="polite">Найдено ключей: {view.total} из {keys.length}</p>{query.search !== "" && <button type="button" onClick={reset}>Сбросить поиск</button>}</div>
      <ul ref={list} tabIndex={-1} aria-label="Непроверенные локальные ключи" className={styles.documentIssues}>{view.rows.map((key) => <li key={key}><code>{key}</code></li>)}</ul>
      {!view.total && <p className={styles.hint}>Ключи по этому запросу не найдены. Измените запрос или сбросьте поиск.</p>}
      {view.pages > 1 && <div className={styles.pagination}><span>Страница {view.page} из {view.pages}</span><div><button type="button" disabled={view.page === 1} onClick={(event) => turnPage(view.page - 1, event.currentTarget)}>Назад</button><button type="button" disabled={view.page === view.pages} onClick={(event) => turnPage(view.page + 1, event.currentTarget)}>Далее</button></div></div>}
    </div>
  </details>;
}
