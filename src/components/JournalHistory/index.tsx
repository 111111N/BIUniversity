import { useId, useState } from "react";
import type { AcademicLesson } from "../../domain/academic";
import type { JournalChange } from "../../data/journalStore";
import { createHistoryCsv, formatJournalChangeValue, groupJournalChanges, journalFieldLabels } from "../../domain/journalHistory";
import { downloadJournalCsv } from "../../domain/journalExport";
import { matchesSearchText } from "../../domain/search";
import SearchField from "../SearchField";
import ChangeBatch from "./ChangeBatch";
import styles from "./index.module.scss";

type HistoryFilter = "all" | JournalChange["field"];
const FILTERS = [["all", "Все"], ["attendance", "Посещаемость"], ["grade", "Оценки"], ["roster", "Состав группы"], ["demo", "Демоданные"]] as const;
interface Props { changes: JournalChange[]; lessons: AcademicLesson[]; error?: string }

const JournalHistory = ({ changes, lessons, error = "" }: Props) => {
  const headingId = useId();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [limit, setLimit] = useState(8);
  const [exportMessage, setExportMessage] = useState("");
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const searched = changes.filter((change) => {
    const lesson = change.lessonId ? lessonsById.get(change.lessonId) : undefined;
    return matchesSearchText(`${change.studentName} ${change.actor.name} ${journalFieldLabels[change.field]} ${lesson?.date ?? ""} ${lesson?.topic ?? ""} ${formatJournalChangeValue(change.previousValue, change.field)} ${formatJournalChangeValue(change.nextValue, change.field)}`, query);
  });
  const filtered = searched.filter((change) => filter === "all" || change.field === filter);
  const batches = groupJournalChanges(filtered);
  const resetFilters = () => { setQuery(""); setFilter("all"); setLimit(8); };
  const exportHistory = () => {
    try { downloadJournalCsv(createHistoryCsv(filtered, lessons), "journal-history.csv"); setExportMessage(`CSV подготовлен: изменений ${filtered.length}.`); }
    catch { setExportMessage("Не удалось подготовить CSV. Попробуйте ещё раз."); }
  };

  return <section className={styles.history} aria-labelledby={headingId}>
    <header><div><span>Аудит изменений</span><h2 id={headingId}>История журнала</h2><p>Кто, когда и что изменил. Правки одного сохранения собраны вместе.</p></div><button type="button" disabled={!filtered.length || Boolean(error)} onClick={exportHistory}>Экспорт CSV <span aria-hidden="true">↓</span></button></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {exportMessage && <p className={styles.notice} role="status">{exportMessage}</p>}
    {changes.length > 0 && <div className={styles.tools}><SearchField label="Поиск в истории" value={query} onChange={(value) => { setQuery(value); setLimit(8); }} placeholder="Студент, автор, тема или дата занятия" /><div className={styles.filters} role="group" aria-label="Тип изменения">{FILTERS.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? styles.activeFilter : ""} onClick={() => { setFilter(value); setLimit(8); }}>{label}<span>{searched.filter((change) => value === "all" || change.field === value).length}</span></button>)}</div></div>}
    <div className={styles.resultLine}><span role="status">Изменений: {filtered.length} · сохранений: {batches.length}</span>{(query.trim() || filter !== "all") && <button type="button" onClick={resetFilters}>Сбросить фильтры</button>}</div>
    {batches.length ? <div className={styles.batchList}>{batches.slice(0, limit).map((batch, index) => <ChangeBatch key={batch.id} batch={batch} lessonsById={lessonsById} initiallyOpen={index === 0} />)}</div> : <div className={styles.empty}><strong>{error && !changes.length ? "История недоступна" : changes.length ? "Совпадений нет" : "Исправлений пока нет"}</strong><p>{error && !changes.length ? "Записи в хранилище не изменялись. Сообщение выше поможет понять причину." : changes.length ? "Измените поиск или сбросьте фильтры." : "После первого сохранения здесь появятся автор, время и содержание правок."}</p>{changes.length > 0 && <button type="button" onClick={resetFilters}>Показать всю историю</button>}</div>}
    {batches.length > limit && <button type="button" className={styles.loadMore} onClick={() => setLimit((current) => current + 8)}>Показать ещё сохранения · осталось {batches.length - limit}</button>}
    <p className={styles.footnote}>Локальная история хранит до 200 последних изменений. Экспорт включает все найденные записи, даже если часть сохранений пока свёрнута или скрыта за кнопкой «Показать ещё».</p>
  </section>;
};

export default JournalHistory;
