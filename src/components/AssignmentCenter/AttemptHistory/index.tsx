import { useId, useState } from "react";
import { downloadAssignmentFile, SubmissionAttempt } from "../../../data/assignmentStore";
import styles from "./index.module.scss";
import DownloadButton from "../../DownloadButton";
import ArrowCircle from "../../ArrowCircle";
import SubmissionResult from "../SubmissionResult";

const STATUS_LABELS: Record<SubmissionAttempt["status"], string> = {
  submitted: "На проверке",
  revision: "Возвращена на доработку",
  graded: "Оценена",
};

interface Props {
  attempts: SubmissionAttempt[];
  hideCurrentResult?: boolean;
  hideCurrentAnswer?: boolean;
  label?: string;
}

const AnswerText = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  const long = text.length > 900 || text.split("\n").length > 10;
  return <div className={styles.answer}>
    <p id={textId} className={`${styles.answerText} ${long && !expanded ? styles.collapsed : ""}`}>{text || "Ответ без текста"}</p>
    {long && <button type="button" className={styles.expandAnswer} aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded(!expanded)}>{expanded ? "Свернуть ответ" : "Читать ответ полностью"}<ArrowCircle direction={expanded ? "up" : "down"} /></button>}
  </div>;
};

const AttemptHistory = ({ attempts, hideCurrentResult = false, hideCurrentAnswer = false, label = "Мой ответ" }: Props) => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const current = attempts[attempts.length - 1];
  if (!current) return null;
  const previous = attempts.slice(0, -1).reverse();
  if (hideCurrentAnswer && previous.length === 0) return null;
  const renderAttempt = (attempt: SubmissionAttempt, latest = false) => <article className={styles.attempt} key={attempt.id}>
    <header className={styles.attemptHeading}>
      <strong>{latest ? label : `Попытка ${attempt.number}`}</strong>
      <span className={styles.attemptNumber}>{latest ? `Попытка ${attempt.number}` : STATUS_LABELS[attempt.status]}</span>
    </header>
    <div className={styles.attemptMeta}><time dateTime={attempt.sentAt}>{new Date(attempt.sentAt).toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>{attempt.submittedLate && <span className={styles.late}>После дедлайна</span>}</div>
    <AnswerText text={attempt.text} />
    {attempt.attachmentId && attempt.attachmentName && <div className={styles.attachment}><span>Вложение к ответу</span><DownloadButton name={attempt.attachmentName} className={styles.attemptFile} onDownload={() => downloadAssignmentFile(attempt.attachmentId!, attempt.attachmentName!)} /></div>}
    {attempt.status !== "submitted" && (!latest || !hideCurrentResult) && <SubmissionResult attempt={attempt} />}
  </article>;

  return <div className={styles.history}>
    {!hideCurrentAnswer && renderAttempt(current, true)}
    {previous.length > 0 && <details className={styles.previous} onToggle={(event) => setHistoryOpen(event.currentTarget.open)}><summary><span>Предыдущие попытки <b>{previous.length}</b></span><ArrowCircle direction={historyOpen ? "up" : "down"} /></summary><div className={styles.timeline}>{previous.map((attempt) => renderAttempt(attempt))}</div></details>}
  </div>;
};

export default AttemptHistory;
