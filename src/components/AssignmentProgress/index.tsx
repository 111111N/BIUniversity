import type { StudentAssignmentState } from "../../domain/assignments";
import styles from "./index.module.scss";

interface AssignmentProgressProps { state: StudentAssignmentState }

const AssignmentProgress = ({ state }: AssignmentProgressProps) => {
  const stage = state === "graded" ? 3 : state === "submitted" || state === "resubmitted" ? 2 : 1;
  const labels = [state === "revision" ? "Доработка" : "Ответ", "Отправка", "Проверка"];
  return <ol className={`${styles.progress} ${state === "revision" ? styles.revision : ""}`} aria-label="Этапы работы">
    {labels.map((label, index) => <li key={index} className={index + 1 < stage || state === "graded" ? styles.done : index + 1 === stage ? styles.current : ""} aria-current={index + 1 === stage && state !== "graded" ? "step" : undefined}>
      <span aria-hidden="true" />{label}
    </li>)}
  </ol>;
};

export default AssignmentProgress;
