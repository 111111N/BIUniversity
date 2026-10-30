import type { SubmissionAttempt } from "../../../data/assignmentStore";
import styles from "./index.module.scss";

interface Props {
  attempt: SubmissionAttempt;
  historical?: boolean;
}

const SubmissionResult = ({ attempt, historical = false }: Props) => {
  const graded = attempt.status === "graded";
  return <section className={`${styles.result} ${graded ? styles.graded : styles.revision}`} aria-label="Результат проверки">
    <span className={styles.eyebrow}>Результат проверки</span>
    <div className={styles.heading}>
      {graded && attempt.grade && <strong className={`${styles.grade} ${styles[`grade_${attempt.grade}`] ?? ""}`} aria-label={`Оценка ${attempt.grade}`}>{attempt.grade}</strong>}
      <div><strong>{graded ? "Работа проверена" : historical ? "Возвращено на доработку" : "Нужна доработка"}</strong><span>{historical ? "Результат предыдущей попытки" : graded ? "Результат доступен студенту" : "Ожидается новая попытка студента"}</span></div>
    </div>
    {attempt.teacherComment && <div className={styles.comment}><span>Комментарий преподавателя</span><p>{attempt.teacherComment}</p></div>}
    {attempt.reviewedAt && <time className={styles.date} dateTime={attempt.reviewedAt}>{graded ? "Оценка сохранена" : "Возвращено на доработку"} · {new Date(attempt.reviewedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>}
  </section>;
};

export default SubmissionResult;
