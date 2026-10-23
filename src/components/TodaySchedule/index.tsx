import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Schedule from "../ScheduleWidget";
import { useRole } from "../RoleContext";
import { getDemoWeekSchedule, getPersonalSchedule } from "../../data/schedule";
import { toLocalDateKey } from "../../domain/schedule";
import styles from "./index.module.scss";
import ArrowCircle from "../ArrowCircle";
import useManagedScheduleUpdate from "../../hooks/useManagedScheduleUpdate";
import { readManagedScheduleState } from "../../data/managedScheduleStore";

interface Props { date?: Date }
export default function TodaySchedule({ date }: Props) {
  const { currentUser } = useRole();
  useManagedScheduleUpdate();
  const scheduleError = readManagedScheduleState().error;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const selectedDate = date ?? now;
  const key = toLocalDateKey(selectedDate);
  const isToday = key === toLocalDateKey(now);
  const schedule = getPersonalSchedule(getDemoWeekSchedule(selectedDate), currentUser).filter((lesson) => lesson.date === key);
  let nextDate: Date | undefined;
  if (!schedule.length) {
    for (let offset = 1; offset <= 14; offset++) {
      const candidate = new Date(selectedDate);
      candidate.setDate(candidate.getDate() + offset);
      if (getPersonalSchedule(getDemoWeekSchedule(candidate), currentUser).some((lesson) => lesson.date === toLocalDateKey(candidate))) { nextDate = candidate; break; }
    }
  }

  return <section className={styles.container} aria-label="Расписание на день">
    <div className={styles.header}>
      <h2>{isToday ? "Сегодня, " : ""}{selectedDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</h2>
      <Link to={`/schedule?date=${key}`}>Расписание<ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></Link>
    </div>
    <p className={styles.caption}>{selectedDate.toLocaleDateString("ru-RU", { weekday: "long" })} · демонстрационное расписание</p>
    <div className={styles.body}>
      {scheduleError ? <p className={styles.error} role="alert">{scheduleError}</p> : schedule.length ? <Schedule schedule={schedule} currentTime={now} fill /> : nextDate && <div className={styles.nextDay}><span>Следующий учебный день</span><Link to={`/schedule?date=${toLocalDateKey(nextDate)}`}>{nextDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}<ArrowCircle /></Link></div>}
    </div>
  </section>;
}
