import { useId, type ReactNode } from "react";
import type { ScheduleItem } from "../../../types/sched";
import { scheduleLessonTypeLabels } from "../../../domain/scheduleLayout";
import Modal from "../../Modal";
import styles from "./index.module.scss";

interface Props { item: ScheduleItem; onClose(): void; readOnly?: boolean; children?: ReactNode }
/** Only public schedule fields belong here; academic sections stay behind LessonDetails access checks. */
const LessonOverview = ({ item, onClose, readOnly = false, children }: Props) => {
  const titleId = useId();
  const date = new Date(`${item.date}T12:00`);
  return <Modal labelledBy={titleId} onClose={onClose} className={styles.dialog}>
    <header className={styles.header}><div><div className={styles.badges}><span className={styles.type}>{scheduleLessonTypeLabels[item.type]}</span>{readOnly && <span className={styles.viewOnly}>Только расписание</span>}</div><h2 id={titleId}>{item.subject}</h2></div><button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть занятие" title="Закрыть">×</button></header>
    <time className={styles.date} dateTime={`${item.date}T${item.startTime}`}><span><small>{date.toLocaleDateString("ru-RU", { weekday: "long" })}</small><strong>{date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</strong></span><span className={styles.time}><small>Время занятия</small><strong>{item.startTime}–{item.endTime}</strong></span></time>
    <dl className={styles.details}><div><dt>Аудитория</dt><dd>{item.location}</dd></div><div><dt>Группа</dt><dd>{item.group ?? "Не указана"}</dd></div><div><dt>Преподаватель</dt><dd>{item.teacher ?? "Не указан"}</dd></div></dl>
    {!readOnly && children}
  </Modal>;
};
export default LessonOverview;
