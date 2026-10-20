import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { ScheduleItem, WeeklyScheduleData } from "../../types/sched";
import { getAssignments, subscribeAssignmentStore } from "../../data/assignmentStore";
import { getScheduleRange, getWeekDays, layoutScheduleDay, timeToMinutes } from "../../domain/scheduleLayout";
import { toLocalDateKey } from "../../domain/schedule";
import { formatCount } from "../../domain/formatCount";
import { useRole } from "../RoleContext";
import { isAcademicMembershipMatch } from "../../data/academicCatalog";
import { canOpenScheduleLesson } from "../../domain/scheduleAccess";
import ScheduleCard from "../ScheduleCard";
import ArrowCircle from "../ArrowCircle";
import LessonDetails from "./LessonDetails";
import WeekList from "./WeekList";
import useDragScroll from "../../hooks/useDragScroll";
import useViewPreference from "../../hooks/useViewPreference";
import styles from "./index.module.scss";

const PIXELS_PER_MINUTE = 1.1;
const TIME_COLUMN_WIDTH = 46;
const MIN_DAY_WIDTH = 176;
const VIEWS = ["grid", "list"] as const;
interface Props { schedule: WeeklyScheduleData; selectedWeek: Date }
const WeeklySchedule = ({ schedule, selectedWeek }: Props) => {
  const { role, currentUser } = useRole();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [view, setView] = useViewPreference(`bi-university-schedule-view:${currentUser.role}:${currentUser.id}`, VIEWS, "list");
  const [opened, setOpened] = useState<ScheduleItem | null>(null);
  const [assignments, setAssignments] = useState(getAssignments);
  const [scrollState, setScrollState] = useState({ left: false, right: true });
  useEffect(() => subscribeAssignmentStore(() => setAssignments(getAssignments())), []);
  useEffect(() => {
    if (!rootRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);
  const days = getWeekDays(selectedWeek);
  const weekKey = days[0].key;
  const dragScroll = useDragScroll(scrollRef, { axis: "both", enabled: view === "grid", resetKey: weekKey });
  const weekKeys = new Set(days.map((entry) => entry.key));
  const lessons = schedule.filter((item) => weekKeys.has(item.date)).sort((a, b) => a.date.localeCompare(b.date) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const activeView = view;
  const dayWidth = Math.max(MIN_DAY_WIDTH, (width - TIME_COLUMN_WIDTH) / Math.max(1, Math.min(7, Math.floor((width - TIME_COLUMN_WIDTH) / MIN_DAY_WIDTH))));
  const range = getScheduleRange(lessons);
  const height = (range.end - range.start) * PIXELS_PER_MINUTE;
  const times = Array.from({ length: Math.ceil((range.end - range.start) / 60) + 1 }, (_, index) => range.start + index * 60);
  const today = toLocalDateKey(new Date());
  const canOpen = (item: ScheduleItem) => canOpenScheduleLesson(item, currentUser);
  const openLesson = (item: ScheduleItem) => { if (canOpen(item)) setOpened(item); };
  const lessonAssignments = (item: ScheduleItem) => canOpen(item) ? assignments.filter((assignment) => (assignment.status === "published" || (role === "teacher" && assignment.status === "draft")) && assignment.subject === item.subject && assignment.group === item.group && assignment.lessonDate.startsWith(item.date) && isAcademicMembershipMatch(currentUser.memberships, assignment.subject, assignment.group)) : [];
  const syncScroll = () => {
    const element = scrollRef.current;
    if (element) setScrollState({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
  };
  useEffect(() => { setOpened(null); scrollRef.current?.scrollTo({ top: 0, left: 0 }); }, [weekKey, schedule, currentUser.id]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) setScrollState({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
    });
    return () => cancelAnimationFrame(frame);
  }, [width, activeView, lessons.length]);
  const move = (direction: number) => scrollRef.current?.scrollBy({ left: dayWidth * direction, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); }
  };

  return <div className={styles.container} ref={rootRef}>
    <div className={styles.toolbar}><div className={styles.summary}><strong>{formatCount(lessons.length, ["занятие", "занятия", "занятий"])}</strong><span>{formatCount(new Set(lessons.map((item) => item.date)).size, ["учебный день", "учебных дня", "учебных дней"])}</span></div><div className={styles.actions}><div className={styles.views} aria-label="Вид расписания"><button type="button" aria-pressed={activeView === "grid"} onClick={() => setView("grid")}>Сетка</button><button type="button" aria-pressed={activeView === "list"} onClick={() => setView("list")}>Список</button></div><button type="button" className={styles.print} onClick={() => window.print()}>Печать / PDF</button></div></div>
    {!lessons.length ? <div className={styles.empty} role="status"><strong>На этой неделе занятий нет</strong><span>Выберите другую неделю или измените запрос поиска.</span></div> : <>
      <div className={`${styles.gridView} ${activeView !== "grid" ? styles.inactive : ""}`}>
        <div className={styles.gridTools}><span>Зажмите мышь и перемещайте сетку · на сенсорном экране листайте пальцем</span><div><button type="button" disabled={!scrollState.left} onClick={() => move(-1)} aria-label="Предыдущие дни"><ArrowCircle direction="left" /></button><button type="button" disabled={!scrollState.right} onClick={() => move(1)} aria-label="Следующие дни"><ArrowCircle /></button></div></div>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- A focusable scroll region supports keyboard scrolling; lessons remain native buttons. */}
        <div className={`${styles.scroller} ${dragScroll.dragging ? styles.dragging : ""}`} ref={scrollRef} role="region" tabIndex={0} aria-label="Недельное расписание. Стрелки влево и вправо переключают дни. Зажмите мышь для перемещения сетки" onScroll={syncScroll} onKeyDown={onGridKey} onPointerDown={dragScroll.onPointerDown} onClickCapture={dragScroll.onClickCapture} onDragStartCapture={dragScroll.onDragStartCapture}>
          <div className={styles.calendar} style={{ "--time-width": `${TIME_COLUMN_WIDTH}px`, "--day-width": `${dayWidth}px`, "--hour-height": `${60 * PIXELS_PER_MINUTE}px` } as CSSProperties}>
            <div className={styles.corner}>Время</div>{days.map(({ date, key }) => <div className={`${styles.dayHeader} ${key === today ? styles.today : ""}`} key={key}><span>{date.toLocaleDateString("ru-RU", { weekday: "short" })}</span><time dateTime={key}>{date.getDate()} {date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</time></div>)}
            <div className={styles.timeColumn} style={{ height }}>{times.map((time) => <time key={time} style={{ top: (time - range.start) * PIXELS_PER_MINUTE }} aria-hidden="true">{String(Math.floor(time / 60)).padStart(2, "0")}:00</time>)}</div>
            {days.map(({ key }) => <div className={`${styles.dayColumn} ${key === today ? styles.todayColumn : ""}`} key={key} style={{ height }}>{layoutScheduleDay(lessons.filter((item) => item.date === key), range.start, PIXELS_PER_MINUTE).map(({ item, top, height: cardHeight, lane, lanes }) => <ScheduleCard key={item.id} grid compact={lanes > 1} readOnly={!canOpen(item)} item={item} onOpen={openLesson} style={{ position: "absolute", top: top + 2, height: Math.max(24, cardHeight - 4), left: `calc(${lane / lanes * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }} />)}</div>)}
          </div>
        </div>
      </div>
      <div className={`${styles.listView} ${activeView !== "list" ? styles.inactive : ""}`}>
        <WeekList lessons={lessons} selectedWeek={selectedWeek} canOpen={canOpen} onOpen={openLesson} />
      </div>
    </>}
    {opened && canOpen(opened) && lessons.some((item) => item.id === opened.id) && <LessonDetails item={opened} assignments={lessonAssignments(opened)} onClose={() => setOpened(null)} />}
  </div>;
};

export default WeeklySchedule;
