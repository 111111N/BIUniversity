import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Schedule from "../ScheduleWidget";
import { useRole } from "../RoleContext";
import { getDemoWeekSchedule, getPersonalSchedule } from "../../data/schedule";
import { toLocalDateKey } from "../../domain/schedule";
import styles from "./index.module.scss";
import ArrowCircle from "../ArrowCircle";
import useManagedScheduleUpdate from "../../hooks/useManagedScheduleUpdate";
import { readManagedScheduleState } from "../../data/managedScheduleStore";
import { retryWithFocusRecovery } from "../DashboardReadError/retryFocus";

interface Props { date?: Date; unavailableReason?: string; onRetry?(): void }
export default function TodaySchedule({ date, unavailableReason, onRetry }: Props) {
  const { currentUser } = useRole();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useManagedScheduleUpdate();
  const scheduleSource = readManagedScheduleState();
  const scheduleError = unavailableReason || scheduleSource.error;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const selectedDate = date ?? now;
  const key = toLocalDateKey(selectedDate);
  const isToday = key === toLocalDateKey(now);
  const schedule = scheduleError ? [] : getPersonalSchedule(getDemoWeekSchedule(selectedDate, scheduleSource), currentUser).filter((lesson) => lesson.date === key);
  let nextDate: Date | undefined;
  if (!scheduleError && !schedule.length) {
    for (let offset = 1; offset <= 14; offset++) {
      const candidate = new Date(selectedDate);
      candidate.setDate(candidate.getDate() + offset);
      if (getPersonalSchedule(getDemoWeekSchedule(candidate, scheduleSource), currentUser).some((lesson) => lesson.date === toLocalDateKey(candidate))) { nextDate = candidate; break; }
    }
  }

  return <section className={styles.container} aria-label="Расписание на день">
    <div className={styles.header}>
      <h2 ref={headingRef} tabIndex={-1}>{isToday ? "Сегодня, " : ""}{selectedDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</h2>
      <Link to={`/schedule?date=${key}`}>Расписание<ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></Link>
    </div>
    <p className={styles.caption}>{selectedDate.toLocaleDateString("ru-RU", { weekday: "long" })} · демонстрационное расписание</p>
    <div className={styles.body}>
      {scheduleError ? <div className={styles.error} role="alert"><p>{scheduleError}</p>{onRetry && <button type="button" onClick={(event) => retryWithFocusRecovery(event.currentTarget, headingRef.current, onRetry)}>Повторить загрузку</button>}</div> : schedule.length ? <Schedule schedule={schedule} currentTime={now} fill /> : nextDate && <div className={styles.nextDay}><span>Следующий учебный день</span><Link to={`/schedule?date=${toLocalDateKey(nextDate)}`}>{nextDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}<ArrowCircle /></Link></div>}
    </div>
  </section>;
}
