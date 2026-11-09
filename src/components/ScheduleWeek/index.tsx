import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { ScheduleItem, WeeklyScheduleData } from "../../types/sched";
import { getScheduleRange, getWeekDays, layoutScheduleDay, timeToMinutes } from "../../domain/scheduleLayout";
import { toLocalDateKey } from "../../domain/schedule";
import { formatCount } from "../../domain/formatCount";
import { useRole } from "../RoleContext";
import { canOpenScheduleLesson } from "../../domain/scheduleAccess";
import ScheduleCard from "../ScheduleCard";
import EdgeScrollControls from "../EdgeScrollControls";
import Card from "../Card";
import PrintIcon from "../PrintIcon";
import EditableLessonDetails from "./EditableLessonDetails";
import LessonOverview from "./LessonDetails/Overview";
import DashboardReadError from "../DashboardReadError";
import WeekList from "./WeekList";
import useDragScroll from "../../hooks/useDragScroll";
import useViewPreference from "../../hooks/useViewPreference";
import useAvailableViewportHeight from "../../hooks/useAvailableViewportHeight";
import { currentScheduleSelection, scheduleWorkspaceKey, type ScheduleLessonSelection } from "./selection";
import styles from "./index.module.scss";

const PIXELS_PER_MINUTE = 1.1;
const TIME_COLUMN_WIDTH = 56;
const MIN_DAY_WIDTH = 200;
const TIME_LABEL_GUTTER = 28;
const VIEWS = ["grid", "list"] as const;
interface Props { schedule: WeeklyScheduleData; selectedWeek: Date; onRetry(): void; readError?: string; filtered?: boolean; selectionContext?: string; context?: ReactNode; toolbarActions?: ReactNode; searchPanel?: ReactNode }
const WeeklySchedule = ({ schedule, selectedWeek, onRetry, readError = "", filtered = false, selectionContext = "", context, toolbarActions, searchPanel }: Props) => {
  const { currentUser } = useRole();
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridFrameRef = useRef<HTMLDivElement>(null);
  const gridId = useId();
  const contentRef = useRef<HTMLElement>(null);
  const scrollPosition = useRef({ scopeKey: "", left: 0, top: 0 });
  const [width, setWidth] = useState(900);
  const [view, setView] = useViewPreference(`bi-university-schedule-view:${currentUser.role}:${currentUser.id}`, VIEWS, "list");
  const [selection, setSelection] = useState<ScheduleLessonSelection | null>(null);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    // Печатный список создаётся только перед печатью, а не держит вторую копию всех пар в DOM.
    const beforePrint = () => flushSync(() => setPrinting(true));
    const afterPrint = () => setPrinting(false);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => { window.removeEventListener("beforeprint", beforePrint); window.removeEventListener("afterprint", afterPrint); };
  }, []);
  const days = useMemo(() => getWeekDays(selectedWeek), [selectedWeek]);
  const scopeKey = scheduleWorkspaceKey(selectedWeek, currentUser, selectionContext);
  const dragScroll = useDragScroll(scrollRef, { axis: "both", enabled: view === "grid", resetKey: scopeKey });
  const lessons = useMemo(() => {
    if (readError) return [];
    const weekKeys = new Set(days.map((entry) => entry.key));
    return schedule.filter((item) => weekKeys.has(item.date)).sort((a, b) => a.date.localeCompare(b.date) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [schedule, days, readError]);
  const gridVisible = view === "grid" && lessons.length > 0;
  useAvailableViewportHeight(scrollRef, gridVisible);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!gridVisible || !scroller) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    setWidth(scroller.clientWidth);
    const saved = scrollPosition.current;
    scroller.scrollTo(saved.scopeKey === scopeKey ? { left: saved.left, top: saved.top } : { left: 0, top: 0 });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [gridVisible, scopeKey]);
  const opened = currentScheduleSelection(lessons, selection, scopeKey);
  const activeView = view;
  const dayWidth = Math.max(MIN_DAY_WIDTH, (width - TIME_COLUMN_WIDTH) / Math.max(1, Math.min(days.length, Math.floor((width - TIME_COLUMN_WIDTH) / MIN_DAY_WIDTH))));
  const range = useMemo(() => getScheduleRange(lessons), [lessons]);
  const height = (range.end - range.start) * PIXELS_PER_MINUTE + TIME_LABEL_GUTTER;
  const times = useMemo(() => Array.from({ length: (range.end - range.start) / 60 + 1 }, (_, index) => range.start + index * 60), [range]);
  const gridDays = useMemo(() => !gridVisible ? [] : days.map((day) => ({ ...day, entries: layoutScheduleDay(lessons.filter((item) => item.date === day.key), range.start, PIXELS_PER_MINUTE).map((entry) => ({
    ...entry,
    style: { position: "absolute", top: entry.top + (entry.height < 44 ? 0 : 2), height: entry.height < 44 ? entry.height : entry.height - 4, left: `calc(${entry.lane / entry.lanes * 100}% + 3px)`, width: `calc(${100 / entry.lanes}% - 6px)` } as CSSProperties,
  })) })), [gridVisible, days, lessons, range.start]);
  const today = toLocalDateKey(new Date());
  const canOpen = useCallback((item: ScheduleItem) => canOpenScheduleLesson(item, currentUser), [currentUser]);
  const openLesson = useCallback((item: ScheduleItem) => setSelection({ id: item.id, scopeKey }), [scopeKey]);
  useEffect(() => { if (selection && !opened) setSelection((current) => current === selection ? null : current); }, [selection, opened]);
  const changeView = (next: typeof view) => {
    const scroller = scrollRef.current;
    if (scroller) scrollPosition.current = { scopeKey, left: scroller.scrollLeft, top: scroller.scrollTop };
    setView(next);
  };
  const move = (direction: number) => scrollRef.current?.scrollBy({ left: dayWidth * direction, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); }
  };

  return <div className={styles.container}>
    <Card className={styles.toolbarCard}>
    <div className={styles.toolbar}>
      <div className={styles.context}>{context}{!readError && <div className={styles.summary}><span>{formatCount(lessons.length, ["занятие", "занятия", "занятий"])}</span><span>{formatCount(new Set(lessons.map((item) => item.date)).size, ["учебный день", "учебных дня", "учебных дней"])}</span></div>}</div>
      <div className={styles.actions}>
        {toolbarActions}
        <div className={styles.views} role="group" aria-label="Вид расписания"><button type="button" aria-pressed={activeView === "grid"} onClick={() => changeView("grid")}>Сетка</button><button type="button" aria-pressed={activeView === "list"} onClick={() => changeView("list")}>Список</button></div>
        <button type="button" hidden className={styles.print} aria-label="Печать / PDF" title="Печать / PDF" disabled={Boolean(readError)} onClick={() => window.print()}><PrintIcon /></button>
      </div>
    </div>
    </Card>
    {searchPanel}
    <Card className={`${styles.scheduleCard} ${gridVisible ? styles.gridCard : ""}`}>
    <section ref={contentRef} tabIndex={-1} className={styles.content} aria-label="Расписание выбранной недели">
    {readError ? <DashboardReadError messages={["Не удалось загрузить расписание."]} onRetry={onRetry} recoveryTarget={contentRef} />
      : !lessons.length ? <div className={styles.empty} role="status"><strong>{filtered ? "По этому запросу занятий нет" : "На этой неделе занятий нет"}</strong><span>{filtered ? "Выберите другую неделю или измените поиск." : "Выберите другую неделю."}</span></div> : <>
      {gridVisible && <div ref={gridFrameRef} className={styles.gridView}>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- A focusable scroll region supports keyboard scrolling; lessons remain native buttons. */}
        <div id={gridId} className={`${styles.scroller} ${dragScroll.dragging ? styles.dragging : ""}`} ref={scrollRef} role="region" tabIndex={0} aria-label="Недельное расписание. Стрелки влево и вправо прокручивают сетку по дням. Зажмите мышь для перемещения сетки" onKeyDown={onGridKey} onPointerDown={dragScroll.onPointerDown} onClickCapture={dragScroll.onClickCapture} onDragStartCapture={dragScroll.onDragStartCapture}>
          <div className={styles.calendar} style={{ "--day-count": days.length, "--time-width": `${TIME_COLUMN_WIDTH}px`, "--day-width": `${dayWidth}px`, "--hour-height": `${60 * PIXELS_PER_MINUTE}px` } as CSSProperties}>
            <div className={styles.corner}>Время</div>{days.map(({ date, key }) => <div className={`${styles.dayHeader} ${key === today ? styles.today : ""}`} key={key}><span>{date.toLocaleDateString("ru-RU", { weekday: "short" })}</span><time dateTime={key} aria-current={key === today ? "date" : undefined}>{date.getDate()} {date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</time></div>)}
            <div className={styles.timeColumn} style={{ height }}>{times.map((time) => <time key={time} style={{ top: (time - range.start) * PIXELS_PER_MINUTE }} aria-hidden="true">{String(Math.floor(time / 60)).padStart(2, "0")}:00</time>)}</div>
            {gridDays.map(({ key, entries }) => <div className={styles.dayColumn} key={key} style={{ height }}>{entries.map(({ item, height: cardHeight, lanes, style }) => <ScheduleCard key={item.id} grid compact={lanes > 1} short={cardHeight < 44} readOnly={!canOpen(item)} item={item} onOpen={openLesson} style={style} />)}</div>)}
          </div>
        </div>
        <EdgeScrollControls boardRef={scrollRef} frameRef={gridFrameRef} boardId={gridId} scopeKey={scopeKey} enabled={activeView === "grid"} step={dayWidth} />
      </div>}
      <div className={`${styles.listView} ${activeView !== "list" ? styles.inactive : ""}`}>
        <WeekList active={activeView === "list" || printing} lessons={lessons} selectedWeek={selectedWeek} canOpen={canOpen} onOpen={openLesson} />
      </div>
    </>}
    </section>
    </Card>
    {opened && (canOpen(opened)
      ? <EditableLessonDetails item={opened} onClose={() => setSelection(null)} />
      : <LessonOverview item={opened} readOnly onClose={() => setSelection(null)} />)}
  </div>;
};

export default WeeklySchedule;
