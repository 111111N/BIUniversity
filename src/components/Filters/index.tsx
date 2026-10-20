import { useEffect, useState, type FormEvent } from "react";
import type { ScheduleItem } from "../../types/sched";
import { getScheduleSuggestions, type ScheduleSearchType } from "../../domain/scheduleLayout";
import SearchField from "../SearchField";
import ArrowCircle from "../ArrowCircle";
import styles from "./index.module.scss";

export interface FilterResult { id: number; title: string; type: ScheduleSearchType }
interface Props { schedule: ScheduleItem[]; selected?: { title: string; type: ScheduleSearchType } | null; onSearch(result: FilterResult): void }
const LABELS = { group: "Группа", auditory: "Аудитория", teacher: "Преподаватель" };
const PLACEHOLDERS = { group: "Например, 112-МКо", auditory: "Например, 101", teacher: "Фамилия или инициалы" };

const Filters = ({ schedule, selected, onSearch }: Props) => {
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
    <div className={styles.heading}><div><span>Быстрый поиск</span><h2>Найти расписание</h2></div><p>Выберите группу, аудиторию или преподавателя</p></div>
    <form onSubmit={submit} className={styles.form}>
      <div className={styles.types} aria-label="Искать по">{(Object.keys(LABELS) as ScheduleSearchType[]).map((key) => <button key={key} type="button" aria-pressed={type === key} className={type === key ? styles.active : ""} onClick={() => { setType(key); setQuery(""); setError(""); }}>{LABELS[key]}</button>)}</div>
      <div className={styles.inputRow}><SearchField label={LABELS[type]} placeholder={PLACEHOLDERS[type]} value={query} onChange={(value) => { setQuery(value); setError(""); }} /><button type="submit" className={styles.searchButton}>Показать<ArrowCircle /></button></div>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.results}><span className={styles.resultsLabel}>{query.trim() ? "Подходящие варианты" : "Быстрый выбор"}</span><ul aria-label="Варианты расписания">{suggestions.map(({ title }) => <li key={title}><button type="button" aria-pressed={selected?.type === type && selected.title === title} onClick={() => { setQuery(title); setError(""); onSearch({ id: 0, title, type }); }}><span>{title}</span><ArrowCircle /></button></li>)}</ul>{!suggestions.length && <p className={styles.noResults} role="status">Вариантов нет. Проверьте запрос или нажмите «Показать», чтобы посмотреть результат.</p>}</div>
  </section>;
};

export default Filters;
