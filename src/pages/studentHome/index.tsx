import { useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import TodaySchedule from "../../components/TodaySchedule";
import Search from "../../components/SearchWidget";
import ArrowCircle from "../../components/ArrowCircle";
import { getStudentDashboard, useDashboardRefresh } from "../../data/studentDashboard";
import { formatDashboardValue } from "../../domain/dashboard";
import { formatCount } from "../../domain/formatCount";
import { toLocalDateKey } from "../../domain/schedule";
import StudentTaskCard from "./StudentTaskCard";
import DashboardReadError from "../../components/DashboardReadError";
import dashboardStyles from "../home/index.module.scss";
import styles from "./index.module.scss";

const StudentHome = () => {
  const { currentUser } = useRole();
  const { now, refresh } = useDashboardRefresh();
  const navigate = useNavigate();
  const [searchMode, setSearchMode] = useState<"group" | "auditorium">("auditorium");
  const [query, setQuery] = useState("");
  const tasksHeading = useId();
  const summaryHeading = useId();
  const tasksHeadingRef = useRef<HTMLHeadingElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const dashboard = getStudentDashboard({ studentId: currentUser.id, memberships: currentUser.memberships, studentGroupId: currentUser.studentGroupId, now });
  const activeTasks = dashboard.tasks.filter((task) => !task.completed);

  return <div className="pageContainer">
    <div className={dashboardStyles.dashboardGrid}>
      <div className={dashboardStyles.leftColumn}>
        <Search searchMode={searchMode} setSearchMode={setSearchMode} query={query} setQuery={setQuery} onSearch={() => {
          const params = new URLSearchParams({ date: toLocalDateKey(now) });
          if (query.trim()) { params.set("type", searchMode === "auditorium" ? "auditory" : "group"); params.set("query", query.trim()); }
          navigate(`/schedule?${params}`);
        }} />
        <div className={`${dashboardStyles.dashboardCard} ${dashboardStyles.scheduleCard}`}><TodaySchedule unavailableReason={dashboard.errors.schedule} onRetry={refresh} /></div>
      </div>

      <div className={dashboardStyles.rightColumn}>
        <section className={`${dashboardStyles.dashboardCard} ${dashboardStyles.focusCard}`} aria-labelledby={tasksHeading}>
          <div className={dashboardStyles.focusHeader}><div><span>Задания</span><h2 id={tasksHeading} ref={tasksHeadingRef} tabIndex={-1} className={dashboardStyles.cardTitle}>Что требует внимания</h2></div><strong>{dashboard.errors.assignments ? "—" : activeTasks.length}</strong></div>
          {dashboard.errors.assignments ? <DashboardReadError messages={[dashboard.errors.assignments]} onRetry={refresh} recoveryTarget={tasksHeadingRef} /> : activeTasks.length ? <div className={`${dashboardStyles.focusList} ${styles.tasks}`}>{activeTasks.slice(0, 3).map((task) => <StudentTaskCard key={task.id} task={task} now={now} recommended={dashboard.nextAction?.href === task.href} />)}</div> : <div className={dashboardStyles.emptyState}><strong>Всё под контролем</strong><span>Актуальных заданий нет.</span></div>}
          {(dashboard.awaitingReview ?? 0) > 0 && !dashboard.activeAssignments && <p className={styles.reviewNotice}>На проверке: {dashboard.awaitingReview}. Преподаватель сообщит результат или вернёт работу на доработку.</p>}
          <Link className={styles.journalLink} to="/journal">В журнал<ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></Link>
        </section>
      </div>

        <section className={`${dashboardStyles.dashboardCard} ${styles.summary}`} aria-labelledby={summaryHeading}>
          <h2 id={summaryHeading} ref={summaryHeadingRef} tabIndex={-1} className={dashboardStyles.cardTitle}>Учебный обзор</h2>
          <DashboardReadError messages={[dashboard.errors.journal, dashboard.errors.schedule]} onRetry={refresh} recoveryTarget={summaryHeadingRef} />
          <dl className={styles.metrics}>
            <div className={styles.metric}><dt>Пар на этой неделе</dt><dd><strong>{dashboard.weekLessons ?? "—"}</strong><span>{dashboard.errors.schedule ? "Расписание недоступно" : dashboard.groupName}</span></dd></div>
            <div className={styles.metric}><dt>Ждут ответа</dt><dd><strong>{dashboard.activeAssignments ?? "—"}</strong><span>{dashboard.errors.assignments ? "Задания недоступны" : dashboard.activeAssignments ? "Можно отправить работу" : dashboard.awaitingReview ? `На проверке: ${dashboard.awaitingReview}` : "Новых действий нет"}</span></dd></div>
            <div className={styles.metric}><dt>Посещаемость</dt><dd><strong>{dashboard.attendance === null ? "—" : `${formatDashboardValue(dashboard.attendance)}%`}</strong><span>{dashboard.errors.journal ? "Журнал недоступен" : dashboard.attendance === null ? "Отметок пока нет" : "По отмеченным занятиям"}</span></dd></div>
            <div className={styles.metric}><dt>Средний балл</dt><dd><strong>{formatDashboardValue(dashboard.averageGrade, 2)}</strong><span>{dashboard.errors.journal ? "Журнал недоступен" : dashboard.gradesCount ? `${formatCount(dashboard.gradesCount, ["оценка", "оценки", "оценок"])} в журнале` : "Оценок пока нет"}</span></dd></div>
          </dl>
        </section>
    </div>
  </div>;
};

export default StudentHome;
