import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScheduleItem, WeeklyScheduleData } from "../../types/sched";
import styles from "./index.module.scss";
import { EditIcon, PdfIcon } from "../ButtonIcons/Icons"; 
import { startOfWeek, endOfWeek, isBefore, isAfter } from "date-fns";

const START_HOUR = 8;
const END_HOUR = 22;
const SLOT_MINUTES = 90;
const DAYS_OF_WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MAX_SUBJECT_LENGTH = 35;
const LESSON_TYPES = ['Лек.', 'Пр.', 'Лаб.', 'Экз.', 'Зач.'];

const SCALE = 1.5;
const getSlotHeight = () => window.innerHeight * 0.08 * SCALE;
const getDayWidth = () => window.innerWidth * 0.10 * SCALE;
const timeToMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const calcGrid = (item: ScheduleItem, slotHeight: number) => {
  const start = timeToMinutes(item.startTime);
  const end = timeToMinutes(item.endTime);
  const offset = start - START_HOUR * 60;
  const duration = end - start;
  return {
    top: (offset / SLOT_MINUTES) * slotHeight,
    height: (duration / SLOT_MINUTES) * slotHeight,
  };
};

interface ScheduleCardProps {
  item: ScheduleItem;
  slotHeight: number;
  onClick?: (item: ScheduleItem) => void;
}

const ScheduleCard: React.FC<ScheduleCardProps> = ({ item, slotHeight, onClick }) => {
  const { top, height } = calcGrid(item, slotHeight);

  let baseSubject = item.subject;
  let displayType = "";

  const subjectParts = item.subject.split(" ").filter(p => p.length > 0);
  const lastWord = subjectParts[subjectParts.length - 1];

  if (lastWord && LESSON_TYPES.some(type => lastWord.replace(".", "").toLowerCase() === type.replace(".", "").toLowerCase())) {
    displayType = lastWord;
    baseSubject = item.subject.substring(0, item.subject.lastIndexOf(lastWord)).trim();
  }

  let displaySubject = baseSubject;
  if (baseSubject.length > MAX_SUBJECT_LENGTH) {
    displaySubject = baseSubject.substring(0, MAX_SUBJECT_LENGTH) + "...";
  }

  const formattedType = displayType ? ` (${displayType})` : "";

  return (
    <div
      className={styles.scheduleItem}
      style={{ top, height }}
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(item)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick?.(item); }}
    >
      <div className={styles.scheduleInfo}>
        <span className={styles.subject}>
          {displaySubject}
          <span className={styles.subjectType}>{formattedType}</span>
        </span>
        <span className={styles.time}>
          {item.startTime} – {item.endTime}
        </span>
        <span className={styles.group}>{item.location}</span>
        <span className={styles.teacher}>{item.teacher}</span>
      </div>
    </div>
  );
};

interface WeeklyScheduleProps {
  schedule: WeeklyScheduleData;
  selectedWeek: Date;
}

const WeeklySchedule: React.FC<WeeklyScheduleProps> = ({ schedule, selectedWeek }) => {
  const navigate = useNavigate();
  const [dimensions, setDimensions] = useState({
    slotHeight: getSlotHeight(),
    dayWidth: getDayWidth(),
  });

  const timeRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // --- grab scroll ---
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!bodyRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - bodyRef.current.offsetLeft);
    setStartY(e.pageY - bodyRef.current.offsetTop);
    setScrollLeft(bodyRef.current.scrollLeft);
    setScrollTop(bodyRef.current.scrollTop);
    bodyRef.current.style.cursor = "grabbing";
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !bodyRef.current) return;
    const x = e.pageX - bodyRef.current.offsetLeft;
    const y = e.pageY - bodyRef.current.offsetTop;
    const walkX = x - startX;
    const walkY = y - startY;
    bodyRef.current.scrollLeft = scrollLeft - walkX;
    bodyRef.current.scrollTop = scrollTop - walkY;
  };

  const onMouseUpOrLeave = () => {
    setIsDragging(false);
    if (bodyRef.current) bodyRef.current.style.cursor = "grab";
  };

  // --- resize ---
  useEffect(() => {
    const handleResize = () =>
      setDimensions({
        slotHeight: getSlotHeight(),
        dayWidth: getDayWidth(),
      });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // --- фильтруем события по выбранной неделе ---
  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });

  const filteredSchedule = schedule.filter(item => {
    const itemDate = item.date ? new Date(item.date) : new Date();
    return !isBefore(itemDate, weekStart) && !isAfter(itemDate, weekEnd);
  });

  const grouped = filteredSchedule.reduce((acc, item) => {
    if (!acc[item.dayOfWeek]) acc[item.dayOfWeek] = [];
    acc[item.dayOfWeek].push(item);
    return acc;
  }, {} as Record<number, ScheduleItem[]>);

  const totalSlots = Math.ceil(((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES);

  // --- синхронизация скролла и прокрутка к текущему времени ---
  useEffect(() => {
    const body = bodyRef.current;
    const header = headerRef.current;
    const timeCol = timeRef.current;
    if (!body || !header || !timeCol) return;

    const { slotHeight, dayWidth } = dimensions;

    const syncY = () => (timeCol.scrollTop = body.scrollTop);
    const syncX = () => (header.style.transform = `translateX(-${body.scrollLeft}px)`);

    body.addEventListener("scroll", syncY);
    body.addEventListener("scroll", syncX);

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const offsetMinutes = Math.max(currentMinutes - START_HOUR * 60, 0);
    const scrollY = (offsetMinutes / SLOT_MINUTES) * slotHeight;
    const currentDay = now.getDay();
    const mappedDay = currentDay === 0 ? 6 : currentDay - 1;
    const scrollX = mappedDay * dayWidth;

    body.scrollTo({ top: scrollY, left: scrollX, behavior: "smooth" });
    header.style.transform = `translateX(-${scrollX}px)`;
    timeCol.scrollTop = scrollY;

    return () => {
      body.removeEventListener("scroll", syncY);
      body.removeEventListener("scroll", syncX);
    };
  }, [dimensions, selectedWeek]);

  const handleCardClick = (item: ScheduleItem) => {
    // Переход к профилю по имени преподавателя или группе
    // Можно заменить на реальные маршруты
    navigate(`/profile/${encodeURIComponent(item.teacher || item.location)}`);
  };

  return (
    <div className={styles.scheduleContainer}>
      <div className={styles.scheduleGrid}>
        <div className={styles.timeColumn}>
          <div className={styles.timeColumnInner} ref={timeRef}>
            {Array.from({ length: totalSlots }).map((_, i) => {
              const hour = START_HOUR + Math.floor((i * SLOT_MINUTES) / 60);
              const minutes = (i * SLOT_MINUTES) % 60;
              const label = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
              return (
                <div
                  key={i}
                  className={styles.timeSlot}
                  style={{ height: `${dimensions.slotHeight}px`, lineHeight: `${dimensions.slotHeight}px` }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.rightSide}>
          <div className={styles.dayHeader} ref={headerRef}>
            {DAYS_OF_WEEK.map((d, i) => (
              <div key={i} className={styles.dayName} style={{ width: `${dimensions.dayWidth}px` }}>
                {d}
              </div>
            ))}
          </div>

          <div
            className={styles.scheduleBodyWrapper}
            ref={bodyRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUpOrLeave}
            onMouseLeave={onMouseUpOrLeave}
            style={{ cursor: "grab" }}
          >
            <div className={styles.scheduleBody}>
              {DAYS_OF_WEEK.map((_, i) => {
                const dayIndex = i + 1;
                const events = grouped[dayIndex] || [];
                return (
                  <div key={i} className={styles.dayColumn} style={{ width: `${dimensions.dayWidth}px` }}>
                    {Array.from({ length: totalSlots }).map((_, k) => (
                      <div key={k} className={styles.hourSlot} style={{ height: `${dimensions.slotHeight}px` }} />
                    ))}
                    {events.map(e => (
                      <ScheduleCard
                        key={e.id}
                        item={e}
                        slotHeight={dimensions.slotHeight}
                        onClick={handleCardClick}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.actionButtons}>
        <button className={styles.editBtn} onClick={() => ""}>
          <EditIcon size={40} />
        </button>
        <button className={styles.pdfBtn} onClick={() => ""}>
          <PdfIcon size={40} textColor="var(--pdf-text-color)"/>
        </button>
      </div>
    </div>
  );
};

export default WeeklySchedule;
