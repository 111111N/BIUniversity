import { assessmentOutcomeLabel, type AssessmentOutcome } from "../../domain/assessmentTypes";
import gradeStyles from "../../components/AssignmentCenter/SubmissionResult/index.module.scss";
import styles from "./index.module.scss";

export default function OutcomeBadge({ outcome, as: Element = "span" }: { outcome: AssessmentOutcome | null; as?: "span" | "strong" }) {
  const graded = outcome?.status === "graded";
  const status = outcome?.status ?? "pending";
  const className = graded
    ? `${styles.compactGrade} ${gradeStyles[`grade_${outcome.grade}`] ?? ""}`
    : `${styles.outcomeBadge} ${status === "passed" ? styles.passed : status === "failed" ? styles.failed : styles.pending}`;
  return <Element className={className} aria-label={graded ? `Оценка ${outcome.grade}` : undefined}>{assessmentOutcomeLabel(outcome)}</Element>;
}
