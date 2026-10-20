import { useId, type Ref } from "react";
import type { Submission } from "../../../data/assignmentStore";
import { getCurrentSubmissionAttempt, getSubmissionAttempts, getSubmissionStatus } from "../../../domain/assignments";
import Dropdown from "../../Dropdown";
import ArrowCircle from "../../ArrowCircle";
import AttemptHistory from "../AttemptHistory";
import SubmissionResult from "../SubmissionResult";
import styles from "./index.module.scss";

const STATUS_LABELS = { submitted: "Ждёт проверки", revision: "На доработке", graded: "Проверено" };

interface Props {
  submission: Submission;
  selected?: boolean;
  targetRef?: Ref<HTMLDivElement>;
  expanded?: boolean;
  onToggle?(button: HTMLButtonElement): void;
  comment: string;
  grade: string;
  saving: boolean;
  onCommentChange(value: string): void;
  onGradeChange(value: string): void;
  onReview(status: "revision" | "graded"): void;
  onReviewNext?(): void;
  hasNext?: boolean;
}

const SubmissionCard = ({ submission, selected = false, targetRef, expanded = false, onToggle, comment, grade, saving, onCommentChange, onGradeChange, onReview, onReviewNext, hasNext = false }: Props) => {
  const bodyId = useId();
  const status = getSubmissionStatus(submission) ?? "submitted";
  const attempt = getCurrentSubmissionAttempt(submission);
  const initials = submission.studentName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
  const hasDraft = Boolean(comment.trim() || grade);
  const canGrade = ["5", "4", "3", "2"].includes(grade);
  const sentAt = attempt?.sentAt ?? submission.sentAt;
  const sentDate = new Date(sentAt);
  const dateLabel = Number.isFinite(sentDate.getTime()) ? sentDate.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Дата не указана";
  const savedGrade = status === "graded" && attempt?.grade;

  return <div ref={targetRef} data-submission-id={submission.id} tabIndex={selected ? -1 : undefined} aria-label={`Ответ: ${submission.studentName}`} className={`${styles.card} ${expanded ? styles.expanded : ""}`}>
    <header className={styles.header}>
      <button type="button" className={styles.toggle} onClick={(event) => onToggle?.(event.currentTarget)} aria-expanded={expanded} aria-controls={expanded ? bodyId : undefined} aria-label={`${expanded ? "Свернуть" : "Раскрыть"} ответ: ${submission.studentName}`}>
      <span className={styles.avatar} aria-hidden="true">{initials}</span>
      <span className={styles.identity}><strong>{submission.studentName}</strong><span className={styles.meta}><time dateTime={sentAt}>{dateLabel}</time><span>Попытка {attempt?.number ?? 1}</span>{attempt?.attachmentId && <span>Есть файл</span>}{attempt?.submittedLate && <span className={styles.late}>После дедлайна</span>}{status === "submitted" && hasDraft && <span className={styles.draftMark}>Есть черновик проверки</span>}</span></span>
      <span className={styles.summarySide}>{savedGrade && <strong className={`${styles.gradeBadge} ${styles[`grade_${savedGrade}`] ?? ""}`} aria-label={`Оценка ${savedGrade}`}>{savedGrade}</strong>}<span className={`${styles.status} ${styles[status]}`}>{STATUS_LABELS[status]}</span></span>
      <svg className={styles.chevron} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
      </button>
    </header>
    {expanded && <div id={bodyId} className={`${styles.body} ${status !== "submitted" ? styles.reviewed : ""}`}>
      <AttemptHistory attempts={getSubmissionAttempts(submission)} hideCurrentResult label="Ответ студента" />
      {status === "submitted" ? <section className={styles.reviewPanel} aria-label={`Проверка работы ${submission.studentName}`} aria-busy={saving}>
        <div className={styles.panelHeading}><span>Обратная связь</span><h4>Проверка работы</h4></div>
        <p className={`${styles.draftHint} ${hasDraft ? styles.unsaved : ""}`} role="status">{saving ? "Сохраняем решение…" : hasDraft ? "Решение ещё не сохранено. Студент пока его не видит." : "Студент увидит оценку и комментарий после сохранения."}</p>
        <label>Комментарий<textarea disabled={saving} aria-label={`Комментарий для ${submission.studentName}`} placeholder="Что получилось и что улучшить" value={comment} onChange={(event) => onCommentChange(event.target.value)} /></label>
        <Dropdown label={`Оценка для ${submission.studentName}`} value={grade} placeholder="Выберите оценку" disabled={saving} onChange={onGradeChange} options={["5", "4", "3", "2"].map((value) => ({ value, label: value }))} />
        <div className={styles.gradeActions}><button type="button" className={styles.primary} disabled={saving || !canGrade} onClick={() => onReview("graded")}>{saving ? "Сохраняем…" : "Сохранить оценку"}</button>{onReviewNext && <button type="button" disabled={saving || !canGrade} aria-label={hasNext ? "Сохранить оценку и открыть следующий ответ" : "Сохранить оценку и завершить очередь"} onClick={onReviewNext}>{hasNext ? "Сохранить и далее" : "Сохранить и завершить"}<ArrowCircle /></button>}</div>
        <div className={styles.revisionAction}><button type="button" disabled={saving || !comment.trim()} onClick={() => onReview("revision")}>Вернуть на доработку</button><small>Для возврата укажите, что нужно исправить.</small></div>
      </section> : attempt && <SubmissionResult attempt={attempt} />}
    </div>}
  </div>;
};

export default SubmissionCard;
