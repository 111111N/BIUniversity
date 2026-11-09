import { useId, useState } from "react";
import SearchField from "../../components/SearchField";
import Card from "../../components/Card";
import Checkbox from "../../components/Checkbox";
import { matchesSearchText } from "../../domain/search";
import { paginate } from "./model";
import styles from "./index.module.scss";

export interface SelectionOption { id: string; name: string; detail?: string }
export function Pagination({ page, pages, total, onChange, disabled = false }: { page: number; pages: number; total: number; onChange(page: number): void; disabled?: boolean }) {
  if (pages <= 1) return null;
  return <nav className={styles.pagination} aria-label="Страницы списка"><span>Всего: {total} · {page} / {pages}</span>{pages > 1 && <><button type="button" disabled={disabled || page === 1} onClick={() => onChange(page - 1)}>Назад</button><button type="button" disabled={disabled || page === pages} onClick={() => onChange(page + 1)}>Далее</button></>}</nav>;
}

export default function SelectionList({ label, options, value, onChange, disabled = false }: { label: string; options: SelectionOption[]; value: string[]; onChange(value: string[]): void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const heading = useId();
  const filtered = options.filter((option) => matchesSearchText(`${option.name} ${option.detail ?? ""}`, query));
  const view = paginate(filtered, page);
  const unavailable = value.filter((id) => !options.some((option) => option.id === id));
  const selected = new Set(value);
  return <Card as="section" className={styles.selection} aria-labelledby={heading}>
    <div className={styles.sectionHeader}><h3 id={heading}>{label}</h3><span>Выбрано: {value.length}</span></div>
    <fieldset disabled={disabled} className={styles.plainFieldset}><SearchField label={`Поиск: ${label.toLowerCase()}`} value={query} placeholder="" onChange={(next) => { setQuery(next); setPage(1); }} /></fieldset>
    <div className={styles.actions}><button type="button" disabled={disabled || !filtered.some((option) => !selected.has(option.id))} onClick={() => onChange([...new Set([...value, ...filtered.map((option) => option.id)])])}>Выбрать {query ? "найденных" : "всех"} ({filtered.length})</button><button type="button" disabled={disabled || !value.length} onClick={() => onChange([])}>Снять выбор</button></div>
    {unavailable.length > 0 && <p className={styles.error} role="alert">Недоступных участников: {unavailable.length}. Снимите выбор и проверьте список заново.</p>}
    <ul className={styles.selectionItems}>{view.items.map((option) => <li key={option.id}><Checkbox checked={selected.has(option.id)} disabled={disabled} onChange={(checked) => onChange(checked ? [...value, option.id] : value.filter((id) => id !== option.id))} label={<span className={styles.optionLabel}>{option.name}{option.detail && <small>{option.detail}</small>}</span>} /></li>)}</ul>
    {!view.items.length && <p className={styles.note}>Ничего не найдено.</p>}
    <Pagination {...view} disabled={disabled} onChange={setPage} />
  </Card>;
}
