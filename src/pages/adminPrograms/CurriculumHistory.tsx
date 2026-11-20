import { useEffect, useRef, useState } from "react";
import { curriculaService } from "../../data/curriculaStore";
import type { CurriculumContext, CurriculumEvent } from "../../domain/curriculumTypes";
import { CurriculumReadOnlyRows, CurriculumRowsSummary } from "./CurriculumRows";
import styles from "./index.module.scss";

export default function CurriculumHistory({ context, entity, id }: { context: CurriculumContext; entity: CurriculumEvent["entity"]; id: string }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; result?: Awaited<ReturnType<typeof curriculaService.history>>; error?: string }>({ key: "" });
  const generation = useRef(0), key = JSON.stringify([context, entity, id, page, retry]);
  useEffect(() => {
    if (!open) return;
    const request = ++generation.current;
    void curriculaService.history(context, entity, id, page).then(result => { if (generation.current === request) setState({ key, result }); })
      .catch(error => { console.error("Не удалось обновить историю плана:", error); if (generation.current === request) setState({ key, error: error instanceof Error ? error.message : "История недоступна." }); });
    return () => { if (generation.current === request) generation.current = request + 1; };
  }, [context, entity, id, page, retry, key, open]);
  const current = state.key === key ? state : undefined;
  return <details className={styles.historyPanel} onToggle={event => setOpen(event.currentTarget.open)}><summary>История изменений</summary>{open && <>
    {!current && <p role="status">Загрузка истории…</p>}
    {current?.error && <p role="alert">{current.error} <button type="button" onClick={() => setRetry(value => value + 1)}>Повторить</button></p>}
    {current?.result && <><p className={styles.note}>Событий: {current.result.total}</p><ol className={styles.history}>{current.result.items.map(event => <li key={event.id}>
      <strong>{event.entity === "binding" ? "Назначение группе" : event.after.state === "published" ? "Публикация" : event.before ? "Изменение черновика" : event.after.number > 1 ? "Новая версия" : "Создание плана"}</strong> · {new Date(event.occurredAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} (Москва)
      {event.entity === "plan" ? <details><summary>{event.after.name} · версия {event.after.number} · {event.after.state === "published" ? "Опубликована" : "Черновик"}</summary><p>{event.after.program.name} · {event.after.form.name}</p><p>{event.after.academicHourMinutes} мин./ак. ч. · {event.after.hoursPerCredit} ак. ч./з.е.</p><CurriculumRowsSummary entries={event.after.entries} hoursPerCredit={event.after.hoursPerCredit} /><CurriculumReadOnlyRows entries={event.after.entries} /></details>
        : <details><summary>{event.after.group.name}</summary><p>{current.result!.planLabels[event.after.planId] ?? "Версия плана недоступна"}</p>{event.after.periods.map(entry => <p key={entry.semester}>{entry.semester} семестр: {entry.period.year.name} · {entry.period.term.name} ({entry.period.term.startsOn} — {entry.period.term.endsOn})</p>)}{!event.after.periods.length && <p>Календарные периоды ещё не назначены.</p>}</details>}
    </li>)}</ol><nav className={styles.actions} aria-label="Страницы истории плана"><button type="button" disabled={current.result.page <= 1} onClick={() => setPage(current.result!.page - 1)}>Назад</button><span>{current.result.page} / {current.result.pages}</span><button type="button" disabled={current.result.page >= current.result.pages} onClick={() => setPage(current.result!.page + 1)}>Далее</button></nav></>}
  </>}</details>;
}
