import { useEffect, useMemo, useState } from "react";
import { assessmentService } from "../../data/assessmentStore";
import type { AssessmentAttemptHistoryPage, AssessmentSnapshot } from "../../domain/assessmentTypes";
import { Pagination } from "./SelectionList";
import { assessmentContext, displayDate } from "./model";
import styles from "./index.module.scss";

interface Props { actorId: string; assessmentId: string; attemptId: string; snapshot: AssessmentSnapshot; blocked: boolean; teacherName(id: string): string }

export default function AttemptAudit({ actorId, assessmentId, attemptId, snapshot, blocked, teacherName }: Props) {
  const [open, setOpen] = useState(false); const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const query = useMemo(() => ({
    request: { ...assessmentContext(snapshot, actorId), assessmentId, attemptId, page },
    enabled: open && !blocked, retry,
  }), [snapshot, actorId, assessmentId, attemptId, page, open, blocked, retry]);
  const [response, setResponse] = useState<{ query: typeof query; view?: AssessmentAttemptHistoryPage; error?: string } | null>(null);
  useEffect(() => {
    if (!query.enabled) return;
    let active = true;
    void (async () => {
      try {
        const view = await assessmentService.readAttemptHistory(query.request);
        if (active) setResponse({ query, view });
      } catch (failure) {
        console.error("Не удалось открыть историю назначения:", failure);
        if (active) setResponse({ query, error: failure instanceof Error ? failure.message : "Не удалось загрузить историю назначения. Повторите попытку." });
      }
    })();
    return () => { active = false; };
  }, [query]);
  // Hide an old response immediately, before the effect cleans up a previous account, revision or page.
  const current = query.enabled && response?.query === query ? response : null;
  const view = current?.view;
  return <details className={styles.disclosure} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>История назначения{view ? ` (${view.total})` : ""}</summary>
    {open && blocked && <p className={styles.note} role="status">История будет доступна после обновления данных аттестации.</p>}
    {query.enabled && !current && <p className={styles.note} role="status">Загружаем историю…</p>}
    {current?.error && <><p className={styles.error} role="alert">{current.error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Повторить загрузку</button></>}
    {view && <><Pagination {...view} onChange={setPage} /><ol>{view.items.map((entry) => <li key={entry.id}>
      <p><strong>{entry.action === "supervisor-changed" ? "Научный руководитель заменён" : entry.action === "attempt-cancelled" ? "Отменено" : entry.action === "attempt-updated" ? "Назначение изменено" : "Назначено"}</strong> · <time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} мск</time></p>
      {entry.previousSupervisorId && <p>Прежний руководитель: {teacherName(entry.previousSupervisorId)}</p>}
      {entry.assignment && <><p>{displayDate(entry.assignment.date)}, {entry.assignment.startsAt} (Москва) · {teacherName(entry.assignment.teacherId)} · {entry.assignment.room || "Без аудитории"}</p>
        {entry.assignment.chairId && <p>Председатель: {teacherName(entry.assignment.chairId)} · Члены комиссии: {entry.assignment.memberIds.map(teacherName).join(", ")}</p>}</>}
      {entry.reason && <p>Причина: {entry.reason}</p>}<p className={styles.note}>Автор: {entry.actorId}</p>
      {entry.assignmentOrigin === "legacy-snapshot" && <p className={styles.note}>Назначение взято из сохранённого снимка старого формата; первоначальные значения отдельно не фиксировались.</p>}
    </li>)}</ol></>}
  </details>;
}
