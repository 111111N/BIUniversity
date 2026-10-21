import { useId, useState } from "react";
import type { ScheduleItem } from "../../../types/sched";
import { getScheduleDayRows, getWeekDays } from "../../../domain/scheduleLayout";
import { toLocalDateKey } from "../../../domain/schedule";
import { DEMO_SCHEDULE_SLOTS } from "../../../data/scheduleSlots";
import ScheduleCard from "../../ScheduleCard";
import EmptySlot from "./EmptySlot";
import styles from "./index.module.scss";

interface Props { lessons: ScheduleItem[]; selectedWeek: Date; canOpen(item: ScheduleItem): boolean; onOpen(item: ScheduleItem): void }
const WeekList = ({ lessons, selectedWeek, canOpen, onOpen }: Props) => {
  const id = useId();
  const days = getWeekDays(selectedWeek);
  const today = toLocalDateKey(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const activeDay = days.some(({ key }) => key === selectedDay) ? selectedDay : days.find(({ key }) => key === today)?.key ?? days[0].key;
  return <section className={styles.list} aria-label="Расписание всей недели списком">
    <nav className={styles.jumpNav} aria-label="Перейти к дню недели"><div>{days.map(({ date, key }) => <button type="button" key={key} aria-label={`Перейти: ${date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}`} aria-current={key === today ? "date" : undefined} aria-pressed={activeDay === key} onClick={() => { setSelectedDay(key); document.getElementById(`${id}-${key}`)?.scrollIntoView({ block: "start", behavior: "auto" }); }}>{date.toLocaleDateString("ru-RU", { weekday: "short" })}<b>{date.getDate()}</b></button>)}</div></nav>
    <div className={styles.columns} aria-hidden="true"><span>№</span><span>Время</span><span>Занятие</span></div>
    <div className={styles.days}>{days.map(({ date, key }) => {
      const events = lessons.filter((item) => item.date === key);
      const rows = getScheduleDayRows(events, DEMO_SCHEDULE_SLOTS);
      return <section key={key} id={`${id}-${key}`} data-schedule-day={key} className={`${styles.day} ${key === today ? styles.today : ""} ${!events.length ? styles.free : ""}`} aria-label={date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}>
        <header className={styles.dayHeading}><div className={styles.dayHeadingContent}><div className={styles.dayIdentity}><h3>{date.toLocaleDateString("ru-RU", { weekday: "long" })}</h3><time dateTime={key}>{date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</time></div><div className={styles.daySummary}>{key === today && <span className={styles.todayBadge}>Сегодня</span>}<span>{events.length ? `Занятий: ${events.length}` : "Свободный день"}</span></div></div></header>
        <div className={styles.rows}>{rows.map((row) => <div key={row.key} className={`${styles.slotRow} ${!row.lessons.length ? styles.emptySlot : ""}`}><span className={styles.slotNumber} aria-label={row.slot ? `Пара ${row.slot.number}` : "Вне сетки звонков"} title={row.slot ? `Пара ${row.slot.number}` : "Вне сетки звонков"}>{row.slot?.number ?? "—"}</span><div className={styles.slotContent}>{!row.slot && <p className={styles.specialTime}>Вне сетки звонков · проверьте время</p>}{row.lessons.length ? row.lessons.map((item) => <ScheduleCard key={item.id} list readOnly={!canOpen(item)} item={item} onOpen={onOpen} />) : row.slot && <EmptySlot slot={row.slot} date={key} overlapping={row.overlapping} />}</div></div>)}</div>
      </section>;
    })}</div>
  </section>;
};

export default WeekList;
