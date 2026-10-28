import { useRef, type ReactNode, type RefObject } from "react";
import SearchField from "../SearchField";
import { getBatchPage } from "./presentation";
import styles from "./index.module.scss";

interface Props {
  searchLabel: string; query: string; total: number; page: number; pageSize: number;
  onQuery(value: string): void; onPage(value: number): void; onReset(): void;
  filters?: ReactNode; children: ReactNode; actionsRef?: RefObject<HTMLElement | null>;
}
export default function BatchReviewList({ searchLabel, query, total, page: requestedPage, pageSize, onQuery, onPage, onReset, filters, children, actionsRef }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLParagraphElement>(null);
  const { page, pages, start, end } = getBatchPage(total, requestedPage, pageSize);
  const changePage = (next: number) => { onPage(next); requestAnimationFrame(() => countRef.current?.focus()); };
  const reset = () => { onReset(); onPage(1); requestAnimationFrame(() => rootRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()); };
  const pagination = (position: string) => pages > 1 && <nav className={styles.pagination} aria-label={`Страницы проверенного списка · ${position}`}>
    <button type="button" disabled={page === 1} onClick={() => changePage(page - 1)}>Назад</button><span>{page} / {pages}</span><button type="button" disabled={page === pages} onClick={() => changePage(page + 1)}>Далее</button>
  </nav>;
  return <div ref={rootRef} className={styles.review}>
    <SearchField label={searchLabel} placeholder="" value={query} onChange={(value) => { onQuery(value); onPage(1); }} />
    {filters}
    <div className={styles.resultLine}><p ref={countRef} tabIndex={-1} role="status">Показано: {total ? start + 1 : 0}–{end} из {total}</p>{pagination("сверху")}</div>
    {total ? children : <div className={styles.empty}><p>Строки не найдены. Измените поиск или фильтр.</p><button type="button" onClick={reset}>Сбросить поиск и фильтр</button></div>}
    {(pages > 1 || actionsRef) && <div className={styles.reviewFooter}>{pagination("снизу")}{actionsRef && <button type="button" onClick={() => actionsRef.current?.focus()}>К действиям со списком</button>}</div>}
  </div>;
}
