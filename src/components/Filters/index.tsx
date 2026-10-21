import { useEffect, useState, type FormEvent } from "react";
import type { ScheduleItem } from "../../types/sched";
import { getScheduleSuggestions, type ScheduleSearchType } from "../../domain/scheduleLayout";
import SearchField from "../SearchField";
import ChevronIcon from "../ChevronIcon";
import SearchIcon from "../SearchIcon";
import { formatCount } from "../../domain/formatCount";
import styles from "./index.module.scss";

export interface FilterResult { id: number; title: string; type: ScheduleSearchType }
interface Props { schedule: ScheduleItem[]; selected?: { title: string; type: ScheduleSearchType } | null; onSearch(result: FilterResult): void; onClose?(): void }
const LABELS = { group: "Группа", auditory: "Аудитория", teacher: "Преподаватель" };
const PLACEHOLDERS = { group: "Например, 112-МКо", auditory: "Например, 101", teacher: "Фамилия или инициалы" };

const Filters = ({ schedule, selected, onSearch, onClose }: Props) => {
  const [type, setType] = useState<ScheduleSearchType>(selected?.type ?? "group");
  const [query, setQuery] = useState(selected?.title ?? "");
  const [error, setError] = useState("");
  useEffect(() => { setType(selected?.type ?? "group"); setQuery(selected?.title ?? ""); setError(""); }, [selected?.type, selected?.title]);
  const suggestions = getScheduleSuggestions(schedule, type, query);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) { setError("Введите запрос или выберите вариант ниже."); return; }
    setError("");
    onSearch({ id: 0, title: query.trim(), type });
  };
  return <section className={styles.panel} aria-label="Поиск расписания">
    <form onSubmit={submit} className={styles.form}>
      <div className={styles.header}><div className={styles.types} role="group" aria-label="Искать по">{(Object.keys(LABELS) as ScheduleSearchType[]).map((key) => <button key={key} type="button" aria-pressed={type === key} onClick={() => { setType(key); setQuery(""); setError(""); }}>{LABELS[key]}</button>)}</div>{onClose && <button type="button" className={styles.close} aria-label="Закрыть поиск" onClick={onClose}><span aria-hidden="true">×</span></button>}</div>
      <div className={styles.inputRow}><div className={styles.query}><SearchIcon className={styles.queryIcon} /><SearchField label={LABELS[type]} placeholder={PLACEHOLDERS[type]} value={query} onChange={(value) => { setQuery(value); setError(""); }} /></div><button type="submit" className={styles.searchButton}>Показать<ChevronIcon direction="right" /></button></div>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.results}><div className={styles.resultsHeading}><span>{query.trim() ? "Подходящие варианты" : "Быстрый выбор"}</span><span className={styles.resultsCount}>{suggestions.length}</span></div><ul aria-label="Варианты расписания">{suggestions.map(({ title, count }) => <li key={title}><button type="button" aria-pressed={selected?.type === type && selected.title === title} onClick={() => { setQuery(title); setError(""); onSearch({ id: 0, title, type }); }}><span className={styles.resultContent}><span>{title}</span><small>{formatCount(count, ["занятие", "занятия", "занятий"])} за неделю</small></span><ChevronIcon direction="right" /></button></li>)}</ul>{!suggestions.length && <p className={styles.noResults} role="status">Совпадений нет. Измените запрос или нажмите «Показать», чтобы открыть расписание по введённому запросу.</p>}</div>
  </section>;
};

export default Filters;
