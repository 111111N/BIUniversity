import { useId, useRef } from "react";
import { downloadAssignmentFile, type Assignment, type Submission } from "../../../data/assignmentStore";
import { getAssignmentDeadlineState, getCurrentSubmissionAttempt, getStudentAssignmentState, getSubmissionAttempts, isSubmissionAllowed } from "../../../domain/assignments";
import AnswerComposer from "../AnswerComposer";
import AttemptHistory from "../AttemptHistory";
import SubmissionResult from "../SubmissionResult";
import DownloadButton from "../../DownloadButton";
import styles from "./index.module.scss";

interface Props {
  assignment: Assignment;
  submission?: Submission;
  studentId: string;
  saving: boolean;
  onSend(text: string, file: File | null): Promise<boolean>;
}

const StudentAssignmentWorkspace = ({ assignment, submission, studentId, saving, onSend }: Props) => {
  const sectionId = useId();
  const current = getCurrentSubmissionAttempt(submission);
  const attempts = getSubmissionAttempts(submission);
  const now = new Date();
  const state = getStudentAssignmentState(assignment, submission, now);
  const admissionOpen = isSubmissionAllowed(assignment, now);
  const canSend = admissionOpen && (!submission || current?.status === "revision");
  const composerOpened = useRef(canSend);
  if (canSend) composerOpened.current = true;
  const showComposer = canSend || (composerOpened.current && (!submission || current?.status === "revision"));
  const revising = current?.status === "revision";
  const reviewed = current?.status === "graded";
  const title = reviewed ? "Работа проверена"
    : current?.status === "submitted" ? state === "resubmitted" ? "Повторный ответ на проверке" : "Ответ на проверке"
    : revising ? admissionOpen ? "Нужна доработка" : "Доработка · приём завершён"
    : !admissionOpen ? "Приём завершён"
    : state === "late-allowed" ? "Можно сдать с опозданием" : "Подготовьте ответ";
  const nextAction = reviewed ? "Оценка и комментарий преподавателя доступны в результате проверки."
    : current?.status === "submitted" ? "Дождитесь решения преподавателя. Изменить отправленный ответ можно только после возврата на доработку."
    : !admissionOpen ? assignment.status === "closed" ? "Преподаватель закрыл приём. Отправить ответ сейчас нельзя; уточните возможность сдачи у преподавателя."
      : assignment.status !== "published" ? "Задание сейчас недоступно для отправки ответа."
      : "Срок сдачи истёк. Отправка после срока для этого задания не разрешена; свяжитесь с преподавателем."
    : revising ? "Исправьте ответ по замечанию преподавателя и проверьте его перед повторной отправкой."
    : state === "late-allowed" ? "Подготовьте ответ ниже. Он будет отмечен как отправленный после срока."
    : "Прочитайте условие, подготовьте ответ и проверьте его перед отправкой.";
  const downloadTask = async () => {
    try { await downloadAssignmentFile(assignment.attachmentId!, assignment.attachmentName!); }
    catch (error) {
      console.error("Не удалось скачать файл задания.", error);
      throw error;
    }
  };

  return <div className={styles.workspace}>
    <section className={styles.status} data-status={reviewed ? "graded" : revising ? "revision" : current?.status ?? "ready"} aria-labelledby={`${sectionId}-status`}>
      <h3 id={`${sectionId}-status`}>{title}</h3>
      <p>{nextAction}</p>
      {canSend && revising && getAssignmentDeadlineState(assignment, now) === "overdue"
        && <p className={styles.late}>Новая попытка будет отмечена как отправленная после срока.</p>}
    </section>

    {revising && <section className={styles.feedback} aria-labelledby={`${sectionId}-feedback`}>
      <h3 id={`${sectionId}-feedback`}>Что нужно исправить</h3>
      <p>{current.teacherComment || "Преподаватель вернул работу на доработку. Уточните необходимые исправления перед повторной отправкой."}</p>
      {current.reviewedAt && <time dateTime={current.reviewedAt}>Возвращено на доработку · {new Date(current.reviewedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>}
    </section>}

    <section className={styles.brief} aria-labelledby={`${sectionId}-brief`}>
      <h3 id={`${sectionId}-brief`}>Условие задания</h3>
      <p className={styles.description}>{assignment.description || "Описание не добавлено."}</p>
      {assignment.attachmentId && assignment.attachmentName && <div className={styles.attachment}>
        <span>Файл задания</span><DownloadButton name={assignment.attachmentName} onDownload={downloadTask} className={styles.file} />
      </div>}
    </section>

    {showComposer ? <div className={styles.myWork}>
      {!canSend && <p role="status">Приём завершён. Текст и выбранный файл остались в форме; скопируйте ответ перед уходом.</p>}
      {current && <details className={styles.previousAnswer}><summary>Ответ до исправления</summary><div><AttemptHistory attempts={[current]} hideCurrentResult label="Отправленный ответ" /></div></details>}
      <AnswerComposer key={`${studentId}:${assignment.id}:${current?.id ?? "first"}`} studentId={studentId} assignmentId={assignment.id}
        assignmentVersion={assignment.updatedAt} attempt={current} saving={saving || !canSend} onSend={onSend} showTeacherComment={false} />
    </div> : <section className={styles.myWork} aria-labelledby={`${sectionId}-work`}>
      <h3 id={`${sectionId}-work`}>Моя работа</h3>
      {current ? <AttemptHistory attempts={[current]} hideCurrentResult label="Отправленный ответ" /> : <p className={styles.empty}>Ответ ещё не отправлен.</p>}
    </section>}

    {reviewed && current && <SubmissionResult attempt={current} />}
    <AttemptHistory attempts={attempts} hideCurrentAnswer />
  </div>;
};

export default StudentAssignmentWorkspace;
