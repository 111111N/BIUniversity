import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ACCOUNT_ROLE_LABELS, type AccountChange } from "../../domain/accounts";
import { getAcademicGroup } from "../../data/academicCatalog";
import { STUDENT_ENROLLMENT_LABELS, isStudentEnrollmentStatus } from "../../domain/studentEnrollment";
import { getAccountHistoryPage } from "./presentation";
import styles from "./AccountHistory.module.scss";

const labels: Record<AccountChange["action"], string> = { created: "Учётная запись создана", "role-changed": "Изменён тип", "assignments-changed": "Изменены назначения", "details-changed": "Обновлены данные", "status-changed": "Изменён доступ", "student-number-issued": "Выдан номер зачетки" };
const fields: Record<string, string> = { name: "Имя", login: "Логин", email: "Почта", group: "Группа", status: "Статус", studentNumber: "Номер зачетки", admissionDate: "Дата зачисления", enrollmentStatus: "Состояние обучения" };
const display = (field: string, value: string) => field === "enrollmentStatus" && isStudentEnrollmentStatus(value) ? STUDENT_ENROLLMENT_LABELS[value] : field === "status" ? value === "blocked" ? "Заблокирована" : "Активна" : field === "group" ? value.split(", ").map((id) => getAcademicGroup(id)?.name ?? id).join(", ") : value || "Не указано";

interface Props { accountId: string; entries: AccountChange[]; accounts: { id: string; name: string }[]; createdAt?: string; requestedPage: string | null; unavailable: boolean; onPage(page: number): void }
export default function AccountHistory({ accountId, entries, accounts, createdAt, requestedPage, unavailable, onPage }: Props) {
  const authors = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const listing = getAccountHistoryPage(entries, requestedPage);
  if (unavailable) return <p className={styles.empty} role="status">История временно недоступна. Повторите чтение данных кнопкой выше.</p>;
  return <section className={styles.history} aria-label="История учётной записи">
    <div className={styles.heading}><p>{createdAt ? <>Создана: <time dateTime={createdAt}>{new Date(createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} мск</time></> : "Дата создания не сохранена"}</p><p role="status">Событий: {entries.length}{entries.length > 0 && ` · ${listing.start + 1}–${listing.start + listing.entries.length}`}</p></div>
    <ol start={listing.start + 1}>{listing.entries.map((entry) => <li key={entry.id}>
      <header><strong>{labels[entry.action]}</strong><time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} мск</time></header>
      <p className={styles.author}>{authors.get(entry.actorId) ?? entry.actorId}</p>
      {entry.action === "role-changed" && <p className={styles.roleChange}>{entry.previousRole ? ACCOUNT_ROLE_LABELS[entry.previousRole] : "Не указан"} → {ACCOUNT_ROLE_LABELS[entry.nextRole]}</p>}
      {Boolean(entry.changes?.length) && <details><summary>Изменённые данные · {entry.changes!.length}</summary><div className={styles.changes}>{entry.changes!.map((change, index) => <section key={`${change.field}:${index}`}><h4>{fields[change.field] ?? change.field}</h4><dl><div><dt>Было</dt><dd>{display(change.field, change.before)}</dd></div><div><dt>Стало</dt><dd>{display(change.field, change.after)}</dd></div></dl></section>)}</div></details>}
      {(entry.importBatchId || entry.studentOperationBatchId || entry.educationEventId) && <nav className={styles.links} aria-label="Связанные записи события">
        {entry.importBatchId && <Link to={`/admin/accounts/import?batch=${encodeURIComponent(entry.importBatchId)}`}>Пакет импорта</Link>}
        {entry.studentOperationBatchId && <Link to={`/admin/students?batch=${encodeURIComponent(entry.studentOperationBatchId)}`}>Массовое действие</Link>}
        {entry.educationEventId && <Link to={`/admin/students/${encodeURIComponent(accountId)}/education#${entry.educationEventId}`}>Событие обучения</Link>}
      </nav>}
    </li>)}</ol>
    {!entries.length && <p className={styles.empty}>Изменений пока нет.</p>}
    {listing.pages > 1 && <nav className={styles.pagination} aria-label="Страницы истории учётной записи"><button type="button" disabled={listing.page === 1} onClick={() => onPage(listing.page - 1)}>Назад</button><span>{listing.page} / {listing.pages}</span><button type="button" disabled={listing.page === listing.pages} onClick={() => onPage(listing.page + 1)}>Далее</button></nav>}
  </section>;
}
