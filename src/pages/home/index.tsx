import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Calendar from "../../components/CalendarWidget";
import Card from "../../components/Card";
import ArrowCircle from "../../components/ArrowCircle";
import { useRole } from "../../components/RoleContext";
import Search from "../../components/SearchWidget";
import TodaySchedule from "../../components/TodaySchedule";
import DashboardReadError from "../../components/DashboardReadError";
import { getTeacherDashboard, useDashboardRefresh } from "../../data/studentDashboard";
import { usePlannerNotes, type PlannerNote } from "../../data/plannerStore";
import { getDemoWeekSchedule, getPersonalSchedule } from "../../data/schedule";
import { createPlannerNote, getPlannerDayNotes, getPlannerNoteDate, getPlannerHref } from "../../domain/planner";
import { toLocalDateKey } from "../../domain/schedule";
import PlannerAgenda from "../../components/PlannerAgenda";
import PlannerNoteForm from "../../components/PlannerNoteForm";
import { parseCalendarDate } from "../../domain/calendar";
import styles from "./index.module.scss";

export default function Home() {
  const { currentUser } = useRole();
  const navigate = useNavigate();
  const [searchMode, setSearchMode] = useState<"group" | "auditorium">("group");
  const [query, setQuery] = useState("");
  const { now, refresh } = useDashboardRefresh();
  const focusHeadingRef = useRef<HTMLHeadingElement>(null);
  const [params, setParams] = useSearchParams();
  const dateParam = params.get("date");
  const selectedDate = useMemo(() => parseCalendarDate(dateParam), [dateParam]);
  const activeDate = selectedDate ?? now;
  const activeKey = toLocalDateKey(activeDate);
  const todayKey = toLocalDateKey(now);
  const { notes, setNotes, error: plannerError } = usePlannerNotes();
  const [taskDraft, setTaskDraft] = useState<PlannerNote | null>(null);
  const [savedTask, setSavedTask] = useState<PlannerNote | null>(null);
  const saveTask = (note: PlannerNote) => {
    const task = { ...note, id: crypto.randomUUID() };
    if (!setNotes((current) => [...current, task])) return;
    setTaskDraft(null);
    setSavedTask(task);
  };
  const selectDate = (date: Date) => {
    setSavedTask(null);
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (toLocalDateKey(date) === todayKey) next.delete("date");
      else next.set("date", toLocalDateKey(date));
      return next;
    }, { replace: true });
  };
  const dashboard = useMemo(
    () => getTeacherDashboard({ memberships: currentUser.memberships, now, teacher: currentUser }),
    [currentUser, now],
  );
  const getDaySummary = (date: Date) => ({
    lessons: dashboard.errors.schedule ? null : getPersonalSchedule(getDemoWeekSchedule(date, dashboard.scheduleSource), currentUser).filter((lesson) => lesson.date === toLocalDateKey(date)).length,
    tasks: plannerError ? null : getPlannerDayNotes(notes, date).length,
  });
  const focusError = Boolean(dashboard.errors.assignments || dashboard.errors.journal);

  return (
    <div className={`pageContainer ${styles.page}`}>
      <div className={styles.dashboardGrid}>
        <div className={styles.leftColumn}>
          <Search
            searchMode={searchMode}
            setSearchMode={setSearchMode}
            query={query}
            setQuery={setQuery}
            onSearch={() => {
              const searchParams = new URLSearchParams({ date: activeKey });
              if (query.trim()) {
                searchParams.set("type", searchMode === "auditorium" ? "auditory" : "group");
                searchParams.set("query", query.trim());
              }
              navigate(`/schedule?${searchParams}`);
            }}
          />

          <Card id="home-schedule" className={styles.scheduleCard}>
            <TodaySchedule date={activeDate} unavailableReason={dashboard.errors.schedule} onRetry={refresh} />
          </Card>

          <Card id="home-tasks">
            <PlannerAgenda date={activeDate} notes={notes} error={plannerError} onCreateTask={() => setTaskDraft(createPlannerNote(activeDate))} />
            {savedTask && <div className={styles.taskNotice} role="status"><span>Добавлено на {getPlannerNoteDate(savedTask).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}: <strong>{savedTask.title}</strong></span><Link to={getPlannerHref(getPlannerNoteDate(savedTask), savedTask.id)}>Открыть<ArrowCircle /></Link><button type="button" aria-label="Скрыть сообщение" onClick={() => setSavedTask(null)}>×</button></div>}
          </Card>

          <Card as="section" className={styles.statsCard} aria-labelledby="home-stats-title">
            <h2 id="home-stats-title" className={styles.cardTitle}>Показатели на сегодня · {now.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</h2>
            <p className={styles.statsPeriod}>Пары — за сегодня. Отметки и оценки — по доступным журналам.</p>
            <div className={styles.flexParams}>
              <div className={styles.paramBox}>
                <div className={styles.summaryValue}>{dashboard.todayLessons === null ? "—" : dashboard.todayLessons ? `${dashboard.conductedLessons} / ${dashboard.todayLessons}` : "Нет пар"}</div>
                <div className={styles.summaryLabel}>Проведено пар сегодня</div>
                {dashboard.todayLessons === null && <span className={styles.unavailable}>Данные расписания недоступны. Повторите загрузку.</span>}
              </div>
              <div className={styles.paramBox}>
                <div className={styles.summaryValue}>{dashboard.attendanceMarked === null ? "—" : `${dashboard.attendanceMarked} / ${dashboard.journalCells}`}</div>
                <div className={styles.summaryLabel}>Заполнено отметок</div>
                {dashboard.attendanceMarked === null && <span className={styles.unavailable}>Данные журнала недоступны. Повторите загрузку.</span>}
              </div>
              <div className={styles.paramBox}>
                <div className={styles.summaryValue}>{dashboard.gradesCount === null ? "—" : `${dashboard.gradesCount} / ${dashboard.gradeCells}`}</div>
                <div className={styles.summaryLabel}>Оценки · практики и лабораторные</div>
                {dashboard.gradesCount === null && <span className={styles.unavailable}>Данные журнала недоступны. Повторите загрузку.</span>}
              </div>
            </div>
            {(dashboard.todayLessons === null || dashboard.attendanceMarked === null || dashboard.gradesCount === null) && <button className={styles.retryButton} type="button" onClick={refresh}>Повторить загрузку показателей</button>}
          </Card>
        </div>
        <div className={styles.rightColumn}>
          <Card as="section" className={styles.focusCard} aria-labelledby="home-focus-title">
            <div className={styles.focusHeader}>
              <div><span>Фокус на сегодня</span><h2 id="home-focus-title" ref={focusHeadingRef} tabIndex={-1} className={styles.cardTitle}>Что требует внимания</h2></div>
              <strong aria-label={focusError ? "Количество недоступно: показаны доступные данные" : `Задач, требующих внимания: ${dashboard.focus.length}`}>{focusError ? "—" : dashboard.focus.length}</strong>
            </div>
            <DashboardReadError messages={[dashboard.errors.assignments, dashboard.errors.journal]} onRetry={refresh} recoveryTarget={focusHeadingRef} />
            {focusError && <p className={styles.partialData}>Показаны доступные данные. Повторите загрузку, чтобы проверить остальные.</p>}
            {dashboard.focus.length ? (
              <div className={styles.focusList}>
                {dashboard.focus.map((item) => (
                  <Link to={item.href} key={item.title}>
                    <i aria-hidden="true" className={item.level === "urgent" ? styles.urgent : item.level === "warning" ? styles.warning : undefined} />
                    <div><strong>{item.title}</strong>{item.level !== "normal" && <em>{item.level === "urgent" ? "Срочно" : "Нужно заполнить"}</em>}<span>{item.description}</span></div>
                    <b>{item.action}<ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></b>
                  </Link>
                ))}
              </div>
            ) : !focusError ? (
              <div className={styles.emptyState}>
                <strong>Всё под контролем</strong>
                <span>Непроверенных работ и незаполненных журналов сейчас нет.</span>
              </div>
            ) : null}
          </Card>

          <Card as="section" className={styles.calendarCard} aria-labelledby="home-calendar-title">
            <h2 id="home-calendar-title" className={styles.cardTitle}>Календарь</h2>
            <Calendar selectedDate={activeDate} onSelectDate={selectDate} getDaySummary={getDaySummary} />
          </Card>
        </div>
      </div>
      {taskDraft && <PlannerNoteForm note={taskDraft} error={plannerError} onSave={saveTask} onClose={() => setTaskDraft(null)} />}
    </div>
  );
}
