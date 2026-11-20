import { Link } from "react-router-dom";
import Card from "../../components/Card";
import { useRole } from "../../components/RoleContext";
import useGroupCalendars from "../../hooks/useGroupCalendars";
import { academicDayKey, academicDayNumber, formatAcademicDay } from "../../domain/academicCalendarMath";
import { getCalendarDayIssue } from "../../domain/groupCalendars";
import styles from "../adminPrograms/index.module.scss";

export default function CalendarNotice({ groupId, weekStart }: { groupId: string; weekStart: string }) {
  const { currentUser } = useRole(), source = useGroupCalendars(currentUser.id);
  const dates = Array.from({ length: 7 }, (_, index) => academicDayKey(academicDayNumber(weekStart) + index));
  const calendars = source.snapshot?.calendars.filter(row => row.group.id === groupId && row.period.term.startsOn <= dates[6] && row.period.term.endsOn >= weekStart) ?? [];
  return <Card className={styles.card}><div className={styles.actions}><strong>Учебный календарь</strong><Link to={`/admin/calendars?group=${encodeURIComponent(groupId)}${calendars.length === 1 ? `&term=${encodeURIComponent(calendars[0].period.term.id)}` : ""}`}>Открыть календарь</Link></div>
    {source.error && <p role="alert" className={styles.error}>{source.error} <button type="button" onClick={source.refresh}>Повторить</button></p>}
    {calendars.map(calendar => <div key={calendar.id}><p>{calendar.period.year.name} · {calendar.period.term.name} · {calendar.state === "closed" ? "Закрыт" : "Открыт"}</p>{calendar.state === "closed" ? <p className={styles.note}>{formatAcademicDay(calendar.period.term.startsOn)} — {formatAcademicDay(calendar.period.term.endsOn)}: изменения запрещены до переоткрытия.</p> : dates.map(date => getCalendarDayIssue(calendar, date)).filter(Boolean).map(message => <p key={message} className={styles.note}>{message}</p>)}</div>)}
    {!source.loading && !source.error && !calendars.length && <p className={styles.note}>Для выбранной недели календарь группы ещё не задан.</p>}
  </Card>;
}
