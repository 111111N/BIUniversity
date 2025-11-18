import { useEffect, useMemo, useRef, useCallback } from "react";
import { parse, isWithinInterval, differenceInMinutes } from "date-fns";
import styles from "./index.module.scss";

export interface ScheduleItem {
  time: string; 
  subject: string;
  group: string;
}

interface ScheduleProps {
  schedule: ScheduleItem[];
  currentTime: Date;
}

export default function Schedule({ schedule, currentTime }: ScheduleProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  const parseTime = useCallback((t: string) => parse(t, "HH:mm", new Date()), []);

  const getLessonStatus = useCallback(
    (timeRange: string) => {
      const [startStr, endStr] = timeRange.split("-");
      const start = parseTime(startStr);
      const end = parseTime(endStr);

      if (isWithinInterval(currentTime, { start, end })) return "now";

      const diff = differenceInMinutes(start, currentTime);

      if (diff > 0 && diff <= 10) return "soon";
      if (diff > 10) {
        const hours = Math.floor(diff / 60);
        const minutes = diff % 60;
        return hours > 0 ? `через ${hours} ч ${minutes} мин` : `через ${diff} мин`;
      }

      return "past";
    },
    [currentTime, parseTime]
  );

  const lessonsWithStatus = useMemo(
    () => schedule.map((item) => ({ ...item, status: getLessonStatus(item.time) })),
    [schedule, getLessonStatus]
  );

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const allItems = container.querySelectorAll(`.${styles.scheduleItem}`);
    if (!allItems.length) return;

    const indexNowOrNext = lessonsWithStatus.findIndex(
      (item) =>
        ["now", "soon"].includes(item.status) || item.status.startsWith("через")
    );

    if (indexNowOrNext === -1) return;

    const target = allItems[indexNowOrNext] as HTMLElement;
    if (!target) return;

    if (container.scrollHeight <= container.clientHeight) return;

    const scrollTop =
      target.offsetTop - container.clientHeight - target.offsetHeight * 1.2;

    const maxScroll = container.scrollHeight - container.clientHeight;
    const safeScroll = Math.max(0, Math.min(scrollTop, maxScroll));

    container.scrollTo({ top: safeScroll, behavior: "smooth" });
  }, [lessonsWithStatus]);

  return (
    <div className={styles.scheduleWrapper} ref={listRef}>
      <ul className={styles.scheduleList}>
        {lessonsWithStatus.map((item, index) => {
          const isNow = item.status === "now";
          const isSoon = item.status === "soon";
          const isNext = item.status.startsWith("через");
          const isPast = item.status === "past";
          const isFirstNext = isNext && !lessonsWithStatus.slice(0, index).some(l => l.status.startsWith("через"));

          return (
            <li
              key={index}
              className={`${styles.scheduleItem} 
                         ${isNow ? styles.now : ""} 
                         ${isSoon ? styles.soon : ""} 
                         ${isNext ? styles.next : ""} 
                         ${isPast ? styles.past : ""} 
                         ${isFirstNext ? styles.firstNext : ""}`}
            >
              <div className={styles.scheduleTime}>
                {item.time}{" "}
                <span className={styles.status}>
                  {isNow
                    ? "сейчас"
                    : isSoon
                    ? "скоро"
                    : isPast
                    ? "прошло"
                    : item.status}
                </span>
              </div>
              <div className={styles.scheduleInfo}>
                <div className={styles.subject}>{item.subject}</div>
                <div className={styles.group}>{item.group}</div>
              </div>

              <a
                href="/cabinet" 
                className={styles.lessonLink}
                aria-label="Перейти в кабинет"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M5 12H19M19 12L12 5M19 12L12 19"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
