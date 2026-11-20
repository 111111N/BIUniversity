import { useEffect, useState } from "react";
import { teachingAssignmentsService } from "../../data/teachingAssignmentsStore";
import type { TeachingAssignment, TeachingAssignmentContext } from "../../domain/teachingAssignments";
import { assessmentPeriodLabel } from "../../domain/assessmentPeriods";
import { lessonTypeLabels } from "../../domain/academic";
import styles from "./index.module.scss";

type Page = Awaited<ReturnType<typeof teachingAssignmentsService.history>>;
function Snapshot({ value, label }: { value: TeachingAssignment; label: string }) {
  const [page, setPage] = useState(1), pages = Math.max(1, Math.ceil(value.periods.length / 20));
  return <details><summary>{label} · {value.mode === "general" ? "Общее назначение" : `Семестров: ${value.periods.length}`}</summary>
    {value.mode === "general" ? <p>Все типы занятий без ограничения периода.</p> : !value.periods.length ? <p>Разрешённых семестров нет.</p> : value.periods.slice((page - 1) * 20, page * 20).map(entry => <p key={entry.period.term.id}>{assessmentPeriodLabel(entry.period)} · {entry.types.map(type => lessonTypeLabels[type]).join(", ")}</p>)}
    {pages > 1 && <nav className={styles.actions} aria-label={`Семестры: ${label}`}><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Далее</button></nav>}
  </details>;
}
export default function TeachingHistory({ context, id }: { context: TeachingAssignmentContext; id: string }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [result, setResult] = useState<{ key: string; data?: Page; error: string } | null>(null);
  const key = JSON.stringify([context, id, page]);
  useEffect(() => {
    if (!open) return;
    let current = true;
    void teachingAssignmentsService.history(context, id, page).then(data => { if (current) setResult({ key, data, error: "" }); })
      .catch(error => { console.error("Не удалось загрузить историю назначения:", error); if (current) setResult({ key, error: error instanceof Error ? error.message : "История недоступна." }); });
    return () => { current = false; };
  }, [context, id, page, open, key]);
  const response = result?.key === key ? result : null;
  return <details className={styles.historyPanel} onToggle={event => setOpen(event.currentTarget.open)}><summary>История назначения</summary>{open && <>
    {!response && <p role="status">Загружаем историю…</p>}{response?.error && <p role="alert">{response.error}</p>}
    <ol className={styles.history}>{response?.data?.items.map(event => <li key={event.id}><strong>{new Date(event.occurredAt).toLocaleString("ru-RU")} · {event.before ? "Изменение назначения" : "Уточнение общего назначения"}</strong><p>Автор: {response.data?.authors[event.actorId] ?? "Учётная запись недоступна"}</p>{event.before ? <Snapshot value={event.before} label="До изменения" /> : <p>Ранее действовало общее назначение; ранняя история не создавалась.</p>}<Snapshot value={event.after} label="После изменения" /></li>)}</ol>
    {response?.data && response.data.pages > 1 && <nav className={styles.actions} aria-label="Страницы истории назначения"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button><span>{page} / {response.data.pages}</span><button type="button" disabled={page >= response.data.pages} onClick={() => setPage(page + 1)}>Далее</button></nav>}
  </>}</details>;
}
