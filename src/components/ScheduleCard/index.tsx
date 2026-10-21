import type { CSSProperties } from "react";
import type { ScheduleItem } from "../../types/sched";
import { scheduleLessonTypeLabels } from "../../domain/scheduleLayout";
import ArrowCircle from "../ArrowCircle";
import styles from "./index.module.scss";

interface Props { item: ScheduleItem; compact?: boolean; short?: boolean; grid?: boolean; list?: boolean; readOnly?: boolean; style?: CSSProperties; onOpen(item: ScheduleItem): void }

const ScheduleCard = ({ item, compact = false, short = false, grid = false, list = false, readOnly = false, style, onOpen }: Props) => {
  const typeClass = `${styles.type} ${styles[item.type === "Пр." ? "practice" : item.type === "Лаб." ? "lab" : "lecture"]}`;
  const className = `${styles.card} ${grid ? styles.grid : ""} ${list ? styles.row : ""} ${compact ? styles.compact : ""} ${short ? styles.short : ""} ${readOnly ? styles.readOnly : ""}`;
  const title = `${item.subject} · ${item.startTime}–${item.endTime} · ${item.location} · ${item.teacher ?? ""}${readOnly ? " · Только просмотр расписания" : ""}`;
  const label = `${item.subject}, ${item.startTime}–${item.endTime}, ${item.group ?? ""}, ${item.location}${item.teacher ? `, преподаватель ${item.teacher}` : ""} — ${readOnly ? "Только просмотр расписания" : "Открыть занятие"}`;
  const content = list ? <>
    <span className={styles.rowTime}><time dateTime={`${item.date}T${item.startTime}`}>{item.startTime}</time><time dateTime={`${item.date}T${item.endTime}`}>до {item.endTime}</time></span>
    <span className={styles.rowContent}><strong className={styles.subject}>{item.subject}</strong><span className={styles.rowMeta}><span className={typeClass}>{scheduleLessonTypeLabels[item.type]}</span>{item.group && <span>{item.group}</span>}<span>{item.location}</span>{item.teacher && <span>{item.teacher}</span>}{readOnly && <span className={styles.viewOnly}>Только расписание</span>}</span></span>
    {!readOnly && <ArrowCircle className={styles.rowArrow} />}
  </> : <>
    <span className={styles.top}><time dateTime={`${item.date}T${item.startTime}`}>{item.startTime}–{item.endTime}</time><span className={typeClass}>{scheduleLessonTypeLabels[item.type]}</span></span>
    <strong className={styles.subject}>{item.subject}</strong>
    <span className={styles.info}><span>{item.location}</span>{item.group && <span>{item.group}</span>}</span>
    {item.teacher && <span className={styles.teacher}>{item.teacher}</span>}
    {!readOnly ? <span className={styles.footer}>{!grid && <span className={styles.openLabel}>Подробнее</span>}<ArrowCircle /></span> : !grid && <span className={styles.viewOnly}>Только расписание</span>}
  </>;
  return readOnly
    ? <article data-schedule-lesson={item.id} className={className} style={style} aria-label={label} title={title}>{content}</article>
    : <button type="button" data-schedule-lesson={item.id} className={className} style={style} onClick={() => onOpen(item)} aria-label={label} title={title}>{content}</button>;
};

export default ScheduleCard;
