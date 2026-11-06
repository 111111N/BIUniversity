import { useState } from "react";
import { assessmentOutcomeLabel, type Assessment, type AssessmentAttempt } from "../../domain/assessmentTypes";
import { matchesSearchText } from "../../domain/search";
import SearchField from "../../components/SearchField";
import { paginate } from "./model";
import { Pagination } from "./SelectionList";
import styles from "./index.module.scss";

export default function AttemptResults({ assessment, attempt, student = false }: { assessment: Assessment; attempt: AssessmentAttempt; student?: boolean }) {
  const [query, setQuery] = useState(""); const [page, setPage] = useState(1);
  const students = assessment.roster.filter((entry) => attempt.studentIds.includes(entry.studentId));
  const view = paginate(students.filter((entry) => matchesSearchText(`${entry.name} ${entry.studentNumber ?? ""}`, query)), page);
  return <div className={styles.results}>
    {!student && students.length > 20 && <SearchField label="Поиск по результатам" value={query} placeholder="" onChange={(value) => { setQuery(value); setPage(1); }} />}
    <ul className={styles.resultList}>{view.items.map((entry) => {
      const outcome = attempt.results.find((result) => result.studentId === entry.studentId)?.outcome ?? null;
      const unsuccessful = outcome?.status === "failed" || (outcome?.status === "graded" && outcome.grade === 2);
      return <li className={styles.resultRow} key={entry.studentId}><div><strong>{student ? "Ваш результат" : entry.name}</strong>{!student && <small>{entry.studentNumber ?? "Номер зачётки не указан"}</small>}</div><span className={unsuccessful ? styles.unsuccessful : styles.outcome}>{assessmentOutcomeLabel(outcome)}</span></li>;
    })}</ul>
    {!view.items.length && <p className={styles.note}>Результаты не найдены.</p>}
    {!student && <Pagination {...view} onChange={setPage} />}
  </div>;
}
