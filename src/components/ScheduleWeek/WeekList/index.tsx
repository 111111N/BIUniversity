import { memo, useId, useMemo, useRef, useState } from "react";
import type { ScheduleItem } from "../../../types/sched";
import { getScheduleDayRows, getWeekDays } from "../../../domain/scheduleLayout";
import { toLocalDateKey } from "../../../domain/schedule";
import { DEMO_SCHEDULE_SLOTS } from "../../../data/scheduleSlots";
import ScheduleCard from "../../ScheduleCard";
import EmptySlot from "./EmptySlot";
import { focusScheduleDay } from "./dayFocus";
import styles from "./index.module.scss";

interface Props { lessons: ScheduleItem[]; selectedWeek: Date; active?: boolean; canOpen(item: ScheduleItem): boolean; onOpen(item: ScheduleItem): void }
const WeekList = ({ lessons, selectedWeek, active = true, canOpen, onOpen }: Props) => {
  const id = useId();
  const daysRef = useRef<HTMLDivElement>(null);
  const today = toLocalDateKey(new Date());
  const [showAllSlots, setShowAllSlots] = useState(false);
  const days = useMemo(() => !active ? [] : getWeekDays(selectedWeek).map((day) => {
    const events = lessons.filter((item) => item.date === day.key);
    return { ...day, events, rows: getScheduleDayRows(events, DEMO_SCHEDULE_SLOTS) };
  }), [active, selectedWeek, lessons]);
  if (!active) return null;
  return <section className={styles.list} aria-label="Расписание всей недели списком">
    <div className={styles.listTools}>
      <nav className={styles.jumpNav} aria-label="Перейти к дню недели"><div>{days.map(({ date, key }) => <button type="button" key={key} aria-label={`Перейти: ${date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}`} aria-controls={`${id}-${key}`} aria-current={key === today ? "date" : undefined} onClick={() => { focusScheduleDay(daysRef.current, key); }}>{date.toLocaleDateString("ru-RU", { weekday: "short" })}<b>{date.getDate()}</b></button>)}</div></nav>
      <button type="button" className={styles.slotToggle} aria-pressed={showAllSlots} onClick={() => setShowAllSlots((current) => !current)}>{showAllSlots ? "Скрыть свободные пары" : "Показать все пары"}</button>
    </div>
    <div className={styles.columns} aria-hidden="true"><span>№</span><span>Время</span><span>Занятие</span></div>
    <div className={styles.days} ref={daysRef}>{days.map(({ date, key, events, rows: allRows }) => {
      const rows = allRows.filter((row) => showAllSlots || row.lessons.length > 0 || row.overlapping.length > 0);
      return <section key={key} id={`${id}-${key}`} data-schedule-day={key} tabIndex={-1} className={`${styles.day} ${!events.length ? styles.free : ""}`} aria-label={date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}>
        <header className={styles.dayHeading}><div className={styles.dayHeadingContent}><div className={styles.dayIdentity}><h3>{date.toLocaleDateString("ru-RU", { weekday: "long" })}</h3><time dateTime={key}>{date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</time></div><div className={styles.daySummary}>{key === today && <span className={styles.todayBadge}>Сегодня</span>}<span>{events.length ? `Занятий: ${events.length}` : "Свободный день"}</span></div></div></header>
        <div className={styles.rows}>{!rows.length && <p className={styles.freeDay}>Свободный день — занятий нет</p>}{rows.map((row) => <div key={row.key} className={`${styles.slotRow} ${!row.lessons.length ? styles.emptySlot : ""}`}><span className={styles.slotNumber} aria-label={row.slot ? `Пара ${row.slot.number}` : "Вне сетки звонков"} title={row.slot ? `Пара ${row.slot.number}` : "Вне сетки звонков"}>{row.slot?.number ?? "—"}</span><div className={styles.slotContent}>{!row.slot && <p className={styles.specialTime}>Вне сетки звонков · проверьте время</p>}{row.lessons.length ? row.lessons.map((item) => <ScheduleCard key={item.id} list readOnly={!canOpen(item)} item={item} onOpen={onOpen} />) : row.slot && <EmptySlot slot={row.slot} date={key} overlapping={row.overlapping} />}</div></div>)}</div>
      </section>;
    })}</div>
  </section>;
};

export default memo(WeekList);
