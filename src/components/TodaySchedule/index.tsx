import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Schedule from "../ScheduleWidget";
import { useRole } from "../RoleContext";
import { getDemoWeekSchedule, getPersonalSchedule } from "../../data/schedule";
import { toLocalDateKey } from "../../domain/schedule";
import styles from "./index.module.scss";
import ArrowCircle from "../ArrowCircle";

interface Props { date?: Date }
export default function TodaySchedule({ date }: Props) {
  const { role } = useRole();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const selectedDate = date ?? now;
  const key = toLocalDateKey(selectedDate);
  const isToday = key === toLocalDateKey(now);
  const schedule = getPersonalSchedule(getDemoWeekSchedule(selectedDate), role).filter((lesson) => lesson.date === key);
  let nextDate: Date | undefined;
  let nextSchedule = schedule;
  if (!schedule.length) {
    for (let offset = 1; offset <= 14; offset++) {
      const candidate = new Date(selectedDate);
      candidate.setDate(candidate.getDate() + offset);
      const lessons = getPersonalSchedule(getDemoWeekSchedule(candidate), role).filter((lesson) => lesson.date === toLocalDateKey(candidate));
      if (lessons.length) { nextDate = candidate; nextSchedule = lessons.slice(0, 2); break; }
    }
  }
  const href = `/schedule?date=${key}`;

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <h2>{isToday ? "Сегодня, " : ""}{selectedDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</h2>
        <Link to={href}>Расписание<ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></Link>
      </div>
      <p className={styles.caption}>{selectedDate.toLocaleDateString("ru-RU", { weekday: "long" })} · демонстрационное расписание</p>
      {schedule.length ? <Schedule schedule={schedule} currentTime={now} /> : <>
        <div className={styles.freeDay}><span aria-hidden="true">✓</span><div><strong>{isToday ? "Сегодня без занятий" : "На этот день занятий нет"}</strong><p>Можно уделить время задачам и подготовке к следующей паре.</p></div></div>
        {nextDate && <div className={styles.nextDay}><div className={styles.nextHeader}><span>Следующий учебный день</span><Link to={`/schedule?date=${toLocalDateKey(nextDate)}`}>{nextDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}<ArrowCircle /></Link></div><Schedule schedule={nextSchedule} currentTime={now} /></div>}
      </>}
    </section>
  );
}
