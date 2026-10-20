import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Calendar from "../../components/CalendarWidget";
import ArrowCircle from "../../components/ArrowCircle";
import { useRole } from "../../components/RoleContext";
import Search from "../../components/SearchWidget";
import TodaySchedule from "../../components/TodaySchedule";
import { getTeacherDashboard, useDashboardUpdate } from "../../data/studentDashboard";
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
  const now = useDashboardUpdate();
  const [params, setParams] = useSearchParams();
  const dateParam = params.get("date");
  const selectedDate = useMemo(() => parseCalendarDate(dateParam), [dateParam]);
  const activeDate = selectedDate ?? now;
  const { notes, setNotes, error: plannerError } = usePlannerNotes();
  const [taskDraft, setTaskDraft] = useState<PlannerNote | null>(null);
  const [savedTask, setSavedTask] = useState<PlannerNote | null>(null);
  const saveTask = (note: PlannerNote) => {
    const task = { ...note, id: crypto.randomUUID() };
    if (!setNotes((current) => [...current, task])) return;
    setTaskDraft(null);
    setSavedTask(task);
  };
  const getDaySummary = (date: Date) => ({
    lessons: getPersonalSchedule(getDemoWeekSchedule(date), "teacher").filter((lesson) => lesson.date === toLocalDateKey(date)).length,
    tasks: plannerError ? null : getPlannerDayNotes(notes, date).length,
  });

  const dashboard = useMemo(
    () => getTeacherDashboard({ memberships: currentUser.memberships, now }),
    [currentUser.memberships, now],
  );

  return (
    <div className="pageContainer">
      <div className={styles.dashboardGrid}>
        <div className={styles.leftColumn}>
          <Search
            searchMode={searchMode}
            setSearchMode={setSearchMode}
            query={query}
            setQuery={setQuery}
            onSearch={() => {
              const params = new URLSearchParams({ date: toLocalDateKey(activeDate) });
              if (query.trim()) {
                params.set("type", searchMode === "auditorium" ? "auditory" : "group");
                params.set("query", query.trim());
              }
              navigate(`/schedule${params.size ? `?${params}` : ""}`);
            }}
          />

          <div className={`${styles.dashboardCard} ${styles.scheduleCard}`}>
            <TodaySchedule date={activeDate} />
          </div>

          <div className={styles.dashboardCard}>
            <PlannerAgenda date={activeDate} notes={notes} error={plannerError} onCreateTask={() => setTaskDraft(createPlannerNote(activeDate))} />
            {savedTask && <div className={styles.taskNotice} role="status"><span>Добавлено на {getPlannerNoteDate(savedTask).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}: <strong>{savedTask.title}</strong></span><Link to={getPlannerHref(getPlannerNoteDate(savedTask), savedTask.id)}>Открыть<ArrowCircle /></Link><button type="button" aria-label="Скрыть сообщение" onClick={() => setSavedTask(null)}>×</button></div>}
          </div>

          <div className={`${styles.dashboardCard} ${styles.flexParams}`}>
            <div className={styles.paramBox}>
              <div className={styles.summaryValue}>{dashboard.todayLessons ? `${dashboard.conductedLessons} / ${dashboard.todayLessons}` : "Нет пар"}</div>
              <div className={styles.summaryLabel}>Проведено пар сегодня</div>
            </div>
            <div className={styles.paramBox}>
              <div className={styles.summaryValue}>{dashboard.attendanceMarked} / {dashboard.journalCells}</div>
              <div className={styles.summaryLabel}>Заполнено отметок</div>
            </div>
            <div className={styles.paramBox}>
              <div className={styles.summaryValue}>{dashboard.gradesCount} / {dashboard.gradeCells}</div>
              <div className={styles.summaryLabel}>Оценки · практики и лабораторные</div>
            </div>
          </div>
        </div>

        <div className={styles.rightColumn}>
          <div className={`${styles.dashboardCard} ${styles.focusCard}`}>
            <div className={styles.focusHeader}>
              <div><span>Фокус на сегодня</span><h2 className={styles.cardTitle}>Что требует внимания</h2></div>
              <strong>{dashboard.focus.length}</strong>
            </div>
            {dashboard.focus.length ? (
              <div className={styles.focusList}>
                {dashboard.focus.map((item) => (
                  <Link to={item.href} key={item.title}>
                    <i className={item.level === "urgent" ? styles.urgent : item.level === "warning" ? styles.warning : undefined} />
                    <div><strong>{item.title}</strong><span>{item.description}</span></div>
                    <b>{item.action}<ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></b>
                  </Link>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <strong>Всё под контролем</strong>
                <span>Непроверенных работ и незаполненных журналов сейчас нет.</span>
              </div>
            )}
          </div>

          <div className={`${styles.dashboardCard} ${styles.calendarCard}`}>
            <h2 className={styles.cardTitle}>Календарь</h2>
            <Calendar selectedDate={activeDate} onSelectDate={(date) => setParams((current) => { const next = new URLSearchParams(current); if (toLocalDateKey(date) === toLocalDateKey(now)) next.delete("date"); else next.set("date", toLocalDateKey(date)); return next; }, { replace: true })} getDaySummary={getDaySummary} />
          </div>
        </div>
      </div>
      {taskDraft && <PlannerNoteForm note={taskDraft} error={plannerError} onSave={saveTask} onClose={() => setTaskDraft(null)} />}
    </div>
  );
}
