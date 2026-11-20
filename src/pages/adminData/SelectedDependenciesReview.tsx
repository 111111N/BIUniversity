import { useState } from "react";
import Dropdown from "../../components/Dropdown";
import { BACKUP_DOCUMENTS } from "../../domain/localBackupDocuments";
import type { SelectedDependenciesReview as Review } from "../../domain/backupSelectedDependencies";
import styles from "./index.module.scss";

export default function SelectedDependenciesReview({ review }: { review: Review }) {
  const [level, setLevel] = useState("all"), [page, setPage] = useState(1);
  const findings = review.issues.filter(issue => level === "all" || issue.level === level).sort((a, b) => Number(b.level === "error") - Number(a.level === "error") || a.kind.localeCompare(b.kind) || a.code.localeCompare(b.code));
  const pages = Math.max(1, Math.ceil(findings.length / 20)), currentPage = Math.min(page, pages);
  return <details className={styles.details}><summary>Зависимости выбранного набора · ошибок {review.counts.errors} · неподтверждённых {review.counts.unconfirmed}</summary><div><p>{review.status === "checks-complete" ? "Поддерживаемые проверки не выявили недоступных связей." : "Есть ошибки или неподтверждённые связи и полномочия. Восстановление заблокировано."}</p><p className={styles.hint}>Проверяются выбранные документы и точные сохранённые версии. Различающиеся базовые учётки, группы, дисциплины и расписание не подменяются произвольно одним источником. Наличие ID не подтверждает историческое право на данные.</p>
    <Dropdown label="Замечания к зависимостям" value={level} options={[{ value: "all", label: "Все" }, { value: "error", label: "Ошибки" }, { value: "review", label: "Нужно подтвердить" }]} onChange={value => { setLevel(value); setPage(1); }} />
    <ol>{findings.slice((currentPage - 1) * 20, currentPage * 20).map(issue => <li key={JSON.stringify([issue.kind, issue.code, issue.recordId, issue.referenceId])}><strong>{BACKUP_DOCUMENTS[issue.kind].label} · {issue.level === "error" ? "Ошибка" : "Нужно подтвердить"}</strong><p>{issue.message}</p>{issue.recordId && <p className={styles.hint}>Запись: {issue.recordId}</p>}{issue.referenceId && <p className={styles.hint}>Связь: {issue.referenceId}</p>}</li>)}</ol>
    {!findings.length && <p>Замечаний выбранного вида нет.</p>}{pages > 1 && <nav className={styles.actions} aria-label="Страницы замечаний к выбранным зависимостям"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Далее</button></nav>}<p className={styles.hint}>Проверено {new Date(review.checkedAt).toLocaleString("ru-RU")}. Это предварительная проверка выбранного набора. Применение, проверка прав на момент записи и откат остаются отдельными этапами.</p></div></details>;
}
