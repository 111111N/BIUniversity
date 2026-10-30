import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { WeeklyScheduleData } from "../../types/sched";
import { getLessonStatus, toLocalDateKey } from "../../domain/schedule";
import ArrowCircle from "../ArrowCircle";
import styles from "./index.module.scss";

interface ScheduleProps {
  schedule: WeeklyScheduleData;
  currentTime: Date;
  fill?: boolean;
}

export default function Schedule({ schedule, currentTime, fill = false }: ScheduleProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const lessons = [...schedule].sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  const activeId = lessons.find((lesson) => getLessonStatus(lesson, currentTime).state !== "past")?.id;

  useEffect(() => {
    const container = listRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-lesson-id="${activeId}"]`);
    if (!container || !target) return;
    container.scrollTo({ top: target.offsetTop, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [activeId]);

  if (!lessons.length) return <p className={styles.empty}>Сегодня занятий нет. <Link to="/schedule">Посмотреть неделю <ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></Link></p>;

  return (
    <div className={`${styles.scheduleWrapper} ${fill ? styles.fill : ""}`} ref={listRef} role="region" aria-label="Занятия на выбранный день" tabIndex={0}>
      <ul className={styles.scheduleList}>
        {lessons.map((item) => {
          const status = getLessonStatus(item, currentTime);
          const label = item.date !== toLocalDateKey(currentTime) && status.state === "next" ? "Запланировано" : status.label;
          const linkLabel = [item.subject, `${item.startTime}–${item.endTime}`, item.group, item.location].filter(Boolean).join(", ");
          return (
            <li key={item.id} data-lesson-id={item.id} className={`${styles.scheduleItem} ${styles[status.state]} ${item.id === activeId && status.state === "next" ? styles.firstNext : ""}`}>
              <div className={styles.scheduleTime}>{item.startTime}–{item.endTime}<span className={styles.status}>{label}</span></div>
              <div className={styles.scheduleInfo}>
                <div className={styles.subject}>{item.subject}</div>
                <div className={styles.group}>{item.group} · {item.location}</div>
                <div className={styles.group}>{item.teacher}</div>
              </div>
              <Link to={`/schedule?date=${item.date}`} className={styles.lessonLink} aria-label={`Открыть расписание: ${linkLabel}`}><ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
