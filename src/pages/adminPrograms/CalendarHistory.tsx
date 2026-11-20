import { useEffect, useState } from "react";
import { groupCalendarsService } from "../../data/groupCalendarsStore";
import type { GroupCalendarContext } from "../../domain/groupCalendarTypes";
import { CalendarContentsList } from "./CalendarContents";
import styles from "./index.module.scss";

export default function CalendarHistory({ context, id }: { context: GroupCalendarContext; id: string }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; result?: Awaited<ReturnType<typeof groupCalendarsService.history>>; error?: string }>({ key: "" });
  const key = JSON.stringify([context, id, page, retry]);
  useEffect(() => {
    if (!open) return;
    let current = true;
    void groupCalendarsService.history(context, id, page).then(result => { if (current) setState({ key, result }); })
      .catch(error => { console.error("Не удалось обновить историю календаря:", error); if (current) setState({ key, error: error instanceof Error ? error.message : "История недоступна." }); });
    return () => { current = false; };
  }, [context, id, page, retry, key, open]);
  const current = state.key === key ? state : undefined;
  return <details className={styles.historyPanel} onToggle={event => setOpen(event.currentTarget.open)}><summary>История календаря и состояния периода</summary>{open && <>
    {!current && <p role="status">Загрузка истории…</p>}{current?.error && <p role="alert">{current.error} <button type="button" onClick={() => setRetry(value => value + 1)}>Повторить</button></p>}
    {current?.result && <><p className={styles.note}>Событий: {current.result.total}</p><ol className={styles.history}>{current.result.items.map(event => <li key={event.id}><strong>{event.action === "closed" ? "Закрыт" : event.action === "reopened" ? "Переоткрыт" : event.action === "copied" ? "Скопирован" : event.before ? "Изменён" : "Создан"}</strong> · {new Date(event.occurredAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} (Москва)
      {event.reason && <p>Причина: {event.reason}</p>}{event.source && <p className={styles.note}>Сдвиг дат копии: {event.source.offsetDays} дн.</p>}
      <details><summary>{event.after.group.name} · {event.after.period.year.name} · {event.after.period.term.name}</summary><p>{event.after.state === "closed" ? "Период закрыт" : "Период открыт"}</p><CalendarContentsList contents={event.after} /></details>
    </li>)}</ol><nav className={styles.actions} aria-label="Страницы истории календаря"><button type="button" disabled={current.result.page <= 1} onClick={() => setPage(current.result!.page - 1)}>Назад</button><span>{current.result.page} / {current.result.pages}</span><button type="button" disabled={current.result.page >= current.result.pages} onClick={() => setPage(current.result!.page + 1)}>Далее</button></nav></>}
  </>}</details>;
}
