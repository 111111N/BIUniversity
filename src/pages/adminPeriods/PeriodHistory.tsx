import { useEffect, useState } from "react";
import { academicPeriodsService, type AcademicPeriodsHistoryPage, type AcademicPeriodsHistoryRequest } from "../../data/academicPeriodsStore";
import styles from "../assessments/index.module.scss";

interface Props { request: Omit<AcademicPeriodsHistoryRequest, "page">; onClose(): void }
export default function PeriodHistory({ request, onClose }: Props) {
  const [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; value?: AcademicPeriodsHistoryPage; error?: string }>({ key: "" });
  const { actorId, actorRevision, expectedRevision, entity, entityId } = request;
  const key = JSON.stringify([actorId, actorRevision, expectedRevision, entity, entityId, page, retry]);
  useEffect(() => {
    let cancelled = false;
    academicPeriodsService.history({ actorId, actorRevision, expectedRevision, entity, entityId, page }).then(value => {
      if (!cancelled) setState({ key, value });
    }).catch(error => {
      console.error("Не удалось загрузить историю учебного периода:", error);
      if (!cancelled) setState({ key, error: error instanceof Error ? error.message : "Не удалось прочитать историю." });
    });
    return () => { cancelled = true; };
  }, [actorId, actorRevision, expectedRevision, entity, entityId, page, retry, key]);
  const current = state.key === key ? state : undefined;
  return <section className={styles.card} aria-label="История учебного периода">
    <div className={styles.sectionHeader}><h3>История изменений</h3><div className={styles.actions}><button type="button" onClick={onClose}>Закрыть историю</button></div></div>
    {!current && <p role="status">Загружаем историю…</p>}
    {current?.error && <div className={styles.error} role="alert"><p>{current.error}</p><button type="button" onClick={() => { setPage(1); setRetry(value => value + 1); }}>Повторить чтение</button></div>}
    {current?.value && <><p className={styles.note}>Событий: {current.value.total}. Авторы указаны по сохранённым ID.</p>
      {current.value.items.map(event => <article key={event.id} className={styles.disclosure}>
        <p><strong>{event.action === "created" ? "Период создан" : "Реквизиты изменены"}</strong></p>
        <p><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} мск</time> · {event.actorId}</p>
        {event.before && <p>Было: {event.before.name} · {event.before.startsOn} — {event.before.endsOn}</p>}
        <p>Стало: {event.after.name} · {event.after.startsOn} — {event.after.endsOn}</p>
      </article>)}
      {current.value.pages > 1 && <nav className={styles.pagination} aria-label="Страницы истории периодов"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Назад</button><span>{page} / {current.value.pages}</span><button type="button" disabled={page === current.value.pages} onClick={() => setPage(value => value + 1)}>Далее</button></nav>}
    </>}
  </section>;
}
