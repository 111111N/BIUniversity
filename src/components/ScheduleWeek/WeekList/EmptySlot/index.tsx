import type { ScheduleItem, ScheduleSlot } from "../../../../types/sched";
import { timeToMinutes } from "../../../../domain/scheduleLayout";
import styles from "./index.module.scss";

interface Props { slot: ScheduleSlot; date: string; overlapping: ScheduleItem[] }
const EmptySlot = ({ slot, date, overlapping }: Props) => {
  const continuation = overlapping.length > 0 && overlapping.every((item) => timeToMinutes(item.startTime) < timeToMinutes(slot.startTime));
  const label = overlapping.length ? continuation ? "Продолжение занятия" : "Занятие в изменённое время" : "Нет занятий";
  return <div className={`${styles.row} ${overlapping.length ? styles.overlapping : ""}`}>
    <span className={styles.time}><time dateTime={`${date}T${slot.startTime}`}>{slot.startTime}</time><time dateTime={`${date}T${slot.endTime}`}>до {slot.endTime}</time></span>
    <span className={styles.content}><span>{label}</span>{overlapping.length > 0 && <small>{overlapping.map((item) => `${item.subject} · ${item.startTime}–${item.endTime}`).join("; ")}</small>}</span>
  </div>;
};

export default EmptySlot;
