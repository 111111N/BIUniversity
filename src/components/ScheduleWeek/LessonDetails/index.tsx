import { useRef } from "react";
import { Link } from "react-router-dom";
import type { ScheduleItem } from "../../../types/sched";
import type { Assignment } from "../../../data/assignmentStore";
import { getJournalHref } from "../../../data/academicCatalog";
import { getAssignmentHref } from "../../../domain/journalNavigation";
import { canOpenScheduleLesson } from "../../../domain/scheduleAccess";
import { useRole } from "../../RoleContext";
import ArrowCircle from "../../ArrowCircle";
import DashboardReadError from "../../DashboardReadError";
import LessonOverview from "./Overview";
import styles from "./index.module.scss";

interface Props { item: ScheduleItem; assignments: Assignment[]; assignmentError?: string; onRetryAssignments(): void; onClose(): void }
const LessonDetails = ({ item, assignments, assignmentError = "", onRetryAssignments, onClose }: Props) => {
  const { currentUser, role } = useRole();
  const assignmentsHeading = useRef<HTMLHeadingElement>(null);
  if (!canOpenScheduleLesson(item, currentUser)) return null;
  const journalHref = getJournalHref(item.subject, item.group);
  const lessonAssignments = assignmentError ? [] : assignments.filter((assignment) => assignment.subject === item.subject && assignment.group === item.group && assignment.lessonDate.startsWith(item.date) && (assignment.status === "published" || (role === "teacher" && assignment.status === "draft")));
  return <LessonOverview item={item} onClose={onClose}>
    <nav className={styles.links} aria-label="Разделы занятия"><Link className={styles.journalLink} to={journalHref}><span><strong>{role === "student" ? "Открыть мой журнал" : "Открыть журнал"}</strong><small>{role === "student" ? "Мои оценки и посещаемость" : "Посещаемость и оценки"}</small></span><ArrowCircle /></Link><Link to={`${journalHref}?tab=materials`}><span><strong>Открыть материалы</strong><small>Файлы по предмету</small></span><ArrowCircle /></Link></nav>
    <section className={styles.assignments}><div className={styles.sectionHeading}><h3 ref={assignmentsHeading} tabIndex={-1}>Задания к занятию</h3>{!assignmentError && <span>{lessonAssignments.length}</span>}</div>{assignmentError
      ? <DashboardReadError messages={[assignmentError]} onRetry={onRetryAssignments} recoveryTarget={assignmentsHeading} />
      : lessonAssignments.length ? <div className={styles.assignmentList}>{lessonAssignments.map((assignment) => <Link key={assignment.id} to={getAssignmentHref(assignment)}><span><strong>{assignment.title}</strong><small>{assignment.status === "draft" ? "Черновик · " : ""}До {new Date(assignment.deadline).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span><ArrowCircle /></Link>)}</div>
      : <div className={styles.empty}><strong>Заданий пока нет</strong><p>{role === "teacher" ? "Добавьте задание в журнале предмета и привяжите его к этой дате." : "Когда преподаватель добавит задание на эту дату, оно появится здесь."}</p></div>}<Link className={styles.allAssignments} to={`${journalHref}?tab=assignments`}><span>{role === "teacher" ? "Управление заданиями" : "Все задания по предмету"}</span><ArrowCircle /></Link></section>
  </LessonOverview>;
};
export default LessonDetails;
