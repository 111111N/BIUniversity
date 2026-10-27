import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EDUCATION_EVENT_LABELS, type EducationState, type StudentEducationEvent } from "../../domain/studentEducationEvent";
import { STUDENT_ENROLLMENT_LABELS } from "../../domain/studentEnrollment";
import { EducationEventSummary, educationDateLabel } from "../../components/EducationEventFields";
import styles from "./index.module.scss";

const stateLabel = (state: EducationState) => `${state.groupName} · ${STUDENT_ENROLLMENT_LABELS[state.enrollment]}`;
function EventCard({ event, author, linked }: { event: StudentEducationEvent; author: string; linked: boolean }) {
  const [expanded, setExpanded] = useState(linked);
  useEffect(() => { if (linked) setExpanded(true); }, [linked]);
  return <article className={`${styles.card} ${linked ? styles.linkedEvent : ""}`} id={event.id} aria-current={linked ? "true" : undefined}>
    <header className={styles.eventHeader}><h4>{EDUCATION_EVENT_LABELS[event.kind]}</h4><time dateTime={event.effectiveDate}>{educationDateLabel(event.effectiveDate)}</time></header>
    <div className={styles.states}>{event.before && <div><span>Было</span><p>{stateLabel(event.before)}</p></div>}<div><span>Стало</span><p>{stateLabel(event.after)}</p></div></div>
    <details className={styles.eventDetails} open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}><summary>Основание и реквизиты</summary><div>
      <EducationEventSummary value={event} />
      <p className={styles.note}>Внесено: <time dateTime={event.registeredAt}>{new Date(event.registeredAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} мск</time> · {author}</p>
      {event.batchId && <Link to={`/admin/students?batch=${encodeURIComponent(event.batchId)}`}>Открыть массовое действие</Link>}
    </div></details>
  </article>;
}

interface Props { events: StudentEducationEvent[]; accounts: { id: string; name: string }[]; linkedId?: string; remaining: number; total: number; onMore(): void }
export default function EducationTimeline({ events, accounts, linkedId, remaining, total, onMore }: Props) {
  const authors = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  return <section className={styles.timeline} aria-label="События обучения">
    <p className={styles.note} role="status">{total ? `Показано: ${events.length} из ${total}` : "Событий обучения пока нет."}</p>
    {events.map((event) => <EventCard key={event.id} event={event} author={authors.get(event.actorId) ?? event.actorId} linked={linkedId === event.id} />)}
    {!total && <p className={styles.note}>Подтверждённые зачисление, перевод, выпуск и отчисление появятся здесь после оформления.</p>}
    {remaining > 0 && <button type="button" onClick={onMore}>Показать ещё события</button>}
  </section>;
}
