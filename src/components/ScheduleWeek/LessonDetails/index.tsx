import { useId } from "react";
import { Link } from "react-router-dom";
import type { ScheduleItem } from "../../../types/sched";
import type { Assignment } from "../../../data/assignmentStore";
import { getJournalHref } from "../../../data/academicCatalog";
import { getAssignmentHref } from "../../../domain/journalNavigation";
import { canOpenScheduleLesson } from "../../../domain/scheduleAccess";
import { scheduleLessonTypeLabels } from "../../../domain/scheduleLayout";
import { useRole } from "../../RoleContext";
import ArrowCircle from "../../ArrowCircle";
import Modal from "../../Modal";
import styles from "./index.module.scss";

interface Props { item: ScheduleItem; assignments: Assignment[]; onClose(): void }
const LessonDetails = ({ item, assignments, onClose }: Props) => {
  const titleId = useId();
  const { currentUser, role } = useRole();
  if (!canOpenScheduleLesson(item, currentUser)) return null;
  const journalHref = getJournalHref(item.subject, item.group);
  const date = new Date(`${item.date}T12:00`);
  const lessonAssignments = assignments.filter((assignment) => assignment.subject === item.subject && assignment.group === item.group && assignment.lessonDate.startsWith(item.date) && (assignment.status === "published" || (role === "teacher" && assignment.status === "draft")));
  return <Modal labelledBy={titleId} onClose={onClose} className={styles.dialog}>
    <header className={styles.header}><div><span className={styles.type}>{scheduleLessonTypeLabels[item.type]}</span><h2 id={titleId}>{item.subject}</h2></div><button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть занятие" title="Закрыть">×</button></header>
    <time className={styles.date} dateTime={`${item.date}T${item.startTime}`}><span><small>{date.toLocaleDateString("ru-RU", { weekday: "long" })}</small><strong>{date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</strong></span><span className={styles.time}><small>Время занятия</small><strong>{item.startTime}–{item.endTime}</strong></span></time>
    <dl className={styles.details}><div><dt>Аудитория</dt><dd>{item.location}</dd></div><div><dt>Группа</dt><dd>{item.group ?? "Не указана"}</dd></div><div><dt>Преподаватель</dt><dd>{item.teacher ?? "Не указан"}</dd></div></dl>
    <nav className={styles.links} aria-label="Разделы занятия"><Link className={styles.journalLink} to={journalHref}><span><strong>{role === "student" ? "Открыть мой журнал" : "Открыть журнал"}</strong><small>{role === "student" ? "Мои оценки и посещаемость" : "Посещаемость и оценки"}</small></span><ArrowCircle /></Link><Link to={`${journalHref}?tab=materials`}><span><strong>Открыть материалы</strong><small>Файлы по предмету</small></span><ArrowCircle /></Link></nav>
    <section className={styles.assignments}><div className={styles.sectionHeading}><h3>Задания к занятию</h3><span>{lessonAssignments.length}</span></div>{lessonAssignments.length ? <div className={styles.assignmentList}>{lessonAssignments.map((assignment) => <Link key={assignment.id} to={getAssignmentHref(assignment)}><span><strong>{assignment.title}</strong><small>{assignment.status === "draft" ? "Черновик · " : ""}До {new Date(assignment.deadline).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span><ArrowCircle /></Link>)}</div> : <div className={styles.empty}><strong>Заданий пока нет</strong><p>{role === "teacher" ? "Добавьте задание в журнале предмета и привяжите его к этой дате." : "Когда преподаватель добавит задание на эту дату, оно появится здесь."}</p></div>}<Link className={styles.allAssignments} to={`${journalHref}?tab=assignments`}><span>{role === "teacher" ? "Управление заданиями" : "Все задания по предмету"}</span><ArrowCircle /></Link></section>
  </Modal>;
};
export default LessonDetails;
