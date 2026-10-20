import { Link } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import TodaySchedule from "../../components/TodaySchedule";
import { getStudentDashboard, useDashboardUpdate } from "../../data/studentDashboard";
import { formatDashboardValue } from "../../domain/dashboard";
import styles from "../studentArea.module.scss";
import ArrowCircle from "../../components/ArrowCircle";
import AssignmentProgress from "../../components/AssignmentProgress";

const StudentHome = () => {
  const { currentUser } = useRole();
  const now = useDashboardUpdate();
  const dashboard = getStudentDashboard({
    studentId: currentUser.id,
    memberships: currentUser.memberships,
    now,
  });
  const activeTasks = dashboard.tasks.filter((task) => !task.completed).slice(0, 3);

  return (
    <div className={`pageContainer ${styles.page}`}>
      <div className={styles.grid}>
        <div className={styles.stack}>
          <section className={styles.card}>
            <TodaySchedule />
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Ближайшие задания</h2>
              <Link to="/journal">Все задания <ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></Link>
            </div>
            {activeTasks.length ? (
              <div className={styles.taskList}>
                {activeTasks.map((task) => (
                  <Link to={task.href} className={`${styles.taskItem} ${styles.taskLink}`} key={task.id}>
                    <div>
                      <span className={styles.taskTag}>{task.subject}</span>
                      <strong>{task.title}</strong>
                      <p>{task.canSubmit ? "Сдать" : "Срок сдачи"}: {task.deadline}</p>
                      <AssignmentProgress state={task.state} />
                    </div>
                    <div className={styles.taskAside}><span className={`${styles.taskStatus} ${task.state === "revision" ? styles.taskRevision : task.state === "submitted" || task.state === "resubmitted" ? styles.taskSubmitted : ""}`}>{task.tag}</span><span className={styles.taskAction}>{task.action}<ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></span></div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className={styles.notice}>
                <strong>Актуальных заданий нет</strong>
                <p>Новые опубликованные задания появятся здесь автоматически.</p>
              </div>
            )}
          </section>
        </div>

        <aside className={styles.stack}>
          <section className={styles.card}>
            <div className={styles.cardHeader}><h2>Моя неделя</h2></div>
            <div className={styles.metrics}>
              <div className={styles.metric}><strong>{dashboard.weekLessons}</strong><span>пар</span></div>
              <div className={styles.metric}><strong>{dashboard.activeAssignments}</strong><span>ждут моего ответа</span></div>
              <div className={styles.metric}><strong>{dashboard.attendance === null ? "—" : `${formatDashboardValue(dashboard.attendance)}%`}</strong><span>посещаемость</span></div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}><h2>Следующее действие</h2></div>
            <div className={styles.notice}>
              {dashboard.nextAction ? (
                <>
                  <strong>{dashboard.nextAction.title}</strong>
                  <p>{dashboard.nextAction.description}</p>
                  <Link to={dashboard.nextAction.href}>Открыть задание <ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></Link>
                </>
              ) : (
                <>
                  <strong>{dashboard.awaitingReview ? "Ожидаем проверки" : "Новых действий нет"}</strong>
                  <p>{dashboard.awaitingReview ? `Отправлено на проверку: ${dashboard.awaitingReview}. Преподаватель сообщит результат или вернёт работу на доработку.` : "Сейчас нет заданий, на которые нужно отправить ответ."}</p>
                </>
              )}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}><h2>Средний балл</h2><Link to="/journal">Подробнее <ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></Link></div>
            <div className={styles.metric}>
              <strong>{formatDashboardValue(dashboard.averageGrade, 2)}</strong>
              <span>{dashboard.gradesCount ? `по ${dashboard.gradesCount} оценкам в журнале` : "оценок пока нет"}</span>
              <div className={styles.progressTrack}>
                <span style={{ width: `${dashboard.averageGrade ? dashboard.averageGrade / 5 * 100 : 0}%` }} />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default StudentHome;
