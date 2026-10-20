import { useId, type Ref } from "react";
import { downloadAssignmentFile, type Submission, type SubmissionAttempt } from "../../../data/assignmentStore";
import { getCurrentSubmissionAttempt, getSubmissionAttempts, getSubmissionStatus } from "../../../domain/assignments";
import DownloadButton from "../../DownloadButton";
import SubmissionResult from "../SubmissionResult";
import styles from "./index.module.scss";

const STATUS_LABELS = { submitted: "На проверке", revision: "На доработке", graded: "Проверено" };

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

const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Дата не указана";
};

const AnswerBody = ({ attempt }: { attempt: SubmissionAttempt }) => <div className={styles.answer}>
  <p>{attempt.text || "Ответ без текста"}</p>
  {attempt.attachmentId && <DownloadButton name={attempt.attachmentName || "Вложение к ответу"} className={styles.file} onDownload={async () => {
    try { await downloadAssignmentFile(attempt.attachmentId!, attempt.attachmentName || "Вложение"); }
    catch (error) {
      console.error("Не удалось скачать вложение ответа студента", error);
      throw error;
    }
  }} />}
</div>;

const SubmissionCard = ({ submission, targetRef, comment, grade, saving, onCommentChange, onGradeChange, onReview, onReviewNext, hasNext = false }: Props) => {
  const commentId = useId();
  const gradeId = useId();
  const status = getSubmissionStatus(submission) ?? "submitted";
  const attempt = getCurrentSubmissionAttempt(submission);
  const previous = getSubmissionAttempts(submission).slice(0, -1).reverse();
  const hasDraft = Boolean(comment.trim() || grade);
  const canGrade = ["5", "4", "3", "2"].includes(grade);
  const sentAt = attempt?.sentAt ?? submission.sentAt;

  return <div ref={targetRef} data-submission-id={submission.id} data-status={status} tabIndex={-1} aria-label={`Ответ: ${submission.studentName}`} className={styles.card}>
    <header className={styles.header}>
      <div><h4>{submission.studentName}</h4><div className={styles.meta}><time dateTime={sentAt}>{dateLabel(sentAt)}</time><span>Попытка {attempt?.number ?? 1}</span>{attempt?.submittedLate && <span className={styles.late}>После дедлайна</span>}</div></div>
      <span className={styles.status}>{STATUS_LABELS[status]}</span>
    </header>
    <div className={styles.body}>
    <div className={styles.answerContent}><h5 className={styles.sectionLabel}>Ответ студента</h5>
    {attempt && <AnswerBody attempt={attempt} />}
    {previous.length > 0 && <details className={styles.previous}><summary>Предыдущие попытки · {previous.length}</summary><div className={styles.history}>{previous.map((item) => <article key={item.id}><header><strong>Попытка {item.number}</strong><time dateTime={item.sentAt}>{dateLabel(item.sentAt)}</time></header><AnswerBody attempt={item} />{item.status !== "submitted" && <div className={styles.result}><SubmissionResult attempt={item} /></div>}</article>)}</div></details>}
    </div>
    {status === "submitted" ? <section className={styles.reviewPanel} aria-label={`Проверка работы ${submission.studentName}`} aria-busy={saving}>
      <h4>Решение преподавателя</h4>
      <fieldset disabled={saving} className={styles.gradeField}><legend>Оценка</legend><div className={styles.grades}>{["5", "4", "3", "2"].map((value) => <label key={value} className={grade === value ? styles.chosenGrade : ""}><input type="radio" name={gradeId} value={value} checked={grade === value} aria-label={`Оценка ${value} для ${submission.studentName}`} onChange={() => onGradeChange(value)} /><span>{value}</span></label>)}</div></fieldset>
      <div className={styles.comment}><label htmlFor={commentId}>Комментарий</label><textarea id={commentId} disabled={saving} aria-label={`Комментарий для ${submission.studentName}`} placeholder="Что получилось и что улучшить" value={comment} onChange={(event) => onCommentChange(event.target.value)} /></div>
      <p className={styles.draftHint} role="status">{saving ? "Сохраняем решение…" : hasDraft ? "Решение ещё не сохранено. Студент пока его не видит." : "Студент увидит решение после сохранения."}</p>
      <div className={styles.gradeActions}>
        {onReviewNext && <button type="button" className={styles.primary} disabled={saving || !canGrade} aria-label={hasNext ? "Сохранить и далее: следующий ответ" : "Сохранить и далее: завершить очередь"} onClick={onReviewNext}>{saving ? "Сохраняем…" : "Сохранить и далее"}</button>}
        <button type="button" className={!onReviewNext ? styles.primary : ""} disabled={saving || !canGrade} onClick={() => onReview("graded")}>Сохранить</button>
      </div>
      <div className={styles.revisionAction}><button type="button" disabled={saving || !comment.trim()} onClick={() => onReview("revision")}>Вернуть на доработку</button><p>Для возврата нужен комментарий с описанием исправлений.</p></div>
    </section> : attempt && <div className={styles.result}><SubmissionResult attempt={attempt} /></div>}
    </div>
  </div>;
};

export default SubmissionCard;
