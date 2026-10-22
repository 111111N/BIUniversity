import { Link } from "react-router-dom";
import type { getStudentDashboardTasks } from "../../domain/dashboardAssignments";
import ArrowCircle from "../../components/ArrowCircle";
import styles from "./index.module.scss";

type Task = ReturnType<typeof getStudentDashboardTasks>[number];
interface Props { task: Task; now: Date; recommended?: boolean }

export default function StudentTaskCard({ task, now, recommended = false }: Props) {
  const deadline = new Date(task.deadlineAt);
  const hasDeadline = Number.isFinite(deadline.getTime());
  const absoluteDeadline = hasDeadline ? deadline.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", ...(deadline.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) }) : "Не указан";
  const deadlineText = hasDeadline && task.canSubmit && !task.overdue ? task.deadline : absoluteDeadline;
  const tone = task.canSubmit ? task.overdue ? styles.urgent : styles.warning : task.state === "submitted" || task.state === "resubmitted" ? styles.submitted : styles.closed;

  return <Link to={task.href} className={styles.task} data-assignment-id={task.id} aria-label={`${recommended ? "Следующее действие. " : ""}${task.subject}. ${task.title}. ${task.tag}. ${task.overdue ? "Срок прошёл" : "Срок"}: ${absoluteDeadline}. ${task.action}`}>
    <i className={tone} aria-hidden="true" />
    <div className={styles.taskContent}>
      <strong>{task.title}</strong>
      <span>{task.subject} · {task.overdue ? "Срок прошёл: " : "Срок: "}<time dateTime={hasDeadline ? deadline.toISOString() : undefined} title={absoluteDeadline}>{deadlineText}</time></span>
      <span className={styles.taskStatus}>{task.tag}</span>
    </div>
    <b className={styles.taskAction}>{task.action}<ArrowCircle hoverBackground="transparent" hoverColor="inherit" /></b>
  </Link>;
}
