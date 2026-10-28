import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { ADMINISTRATION_CHECK_LABELS, ADMINISTRATION_CHECK_PAGE_SIZE, type AdministrationChecksResult, type AdministrationIssue } from "../../domain/administrationChecks";
import { parseCalendarDate } from "../../domain/calendar";
import { createChecksReturn, getCheckResultId, readCheckResultAnchor, withChecksReturn } from "../../domain/administrationChecksNavigation";
import styles from "./index.module.scss";

const issueLink = (issue: AdministrationIssue) => {
  if (issue.kind === "empty-group") return { href: `/admin/groups?group=${encodeURIComponent(issue.groupId!)}`, label: "Открыть состав группы" };
  if (issue.kind === "unassigned-subject") return { href: `/admin/subjects?subject=${encodeURIComponent(issue.subjectId!)}`, label: "Открыть назначения" };
  if (issue.kind === "student-number") return { href: `/admin/accounts?account=${encodeURIComponent(issue.accountId!)}&mode=education`, label: "Выдать номер зачетки" };
  if (issue.groupArchived && issue.groupId) return { href: `/admin/groups?group=${encodeURIComponent(issue.groupId)}`, label: "Открыть архивную группу" };
  return issue.groupId ? { href: `/admin/schedule?group=${encodeURIComponent(issue.groupId)}&date=${encodeURIComponent(issue.weekStart!)}`, label: "Открыть неделю" } : { href: "/admin/groups", label: "Проверить группы" };
};

interface Props {
  snapshot: AdministrationChecksResult | null;
  error: string;
  loading: boolean;
  filtered: boolean;
  onPage(page: number): void;
}

export default function CheckResults({ snapshot, error, loading, filtered, onPage }: Props) {
  const location = useLocation();
  const summaryRef = useRef<HTMLDivElement>(null);
  const restoredLocation = useRef<string | null>(null);
  const requestedId = readCheckResultAnchor(location.hash);
  const targetAvailable = Boolean(snapshot?.rows.some((issue) => getCheckResultId(issue.id) === requestedId));
  useEffect(() => {
    if (error || loading || !snapshot || !requestedId || restoredLocation.current === location.key) return;
    try {
      const target = document.getElementById(requestedId) ?? summaryRef.current;
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest", behavior: "instant" });
      restoredLocation.current = location.key;
    } catch (failure) { console.error("Не удалось вернуть фокус к результатам проверки данных:", failure); }
  }, [snapshot, error, loading, requestedId, location.key]);
  if (error) return <div className={styles.error} role="alert"><strong>Не удалось проверить данные</strong><p>{error}</p><p>Результаты не показаны. Повторите проверку кнопкой выше.</p></div>;
  if (loading || !snapshot) return <div className={styles.loading} role="status" aria-busy="true">Проверяем данные…</div>;
  return <>
    <div ref={summaryRef} className={styles.resultLine} tabIndex={-1} aria-label="Итог проверки данных"><p role="status">Найдено: {snapshot.total}</p><p>Проверено: <time dateTime={snapshot.checkedAt}>{new Date(snapshot.checkedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} мск</time></p></div>
    {requestedId && !targetAvailable && <p className={styles.returnedNotice} role="status">Результаты обновлены. Ранее открытое замечание сейчас не показано на этой странице.</p>}
    {snapshot.total ? <section className={styles.rows} aria-label="Результаты проверки данных">{snapshot.rows.map((issue) => {
      const link = issueLink(issue);
      const returnTo = location.pathname === "/admin/checks" ? createChecksReturn(location.search, snapshot.page, issue.id) : null;
      return <article key={issue.id} id={getCheckResultId(issue.id)} tabIndex={-1} className={styles.card}>
        <div className={styles.content}>
          <div className={styles.meta}><span className={issue.level === "action" ? styles.action : styles.review}>{issue.level === "action" ? "Нужно исправить" : "Проверить"}</span><span>{ADMINISTRATION_CHECK_LABELS[issue.kind]}</span></div>
          <h2>{issue.title}</h2>
          {issue.lessonDate && <time dateTime={issue.lessonDate}>{parseCalendarDate(issue.lessonDate)?.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</time>}
          <p>{issue.detail}</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.openRecord} to={withChecksReturn(link.href, returnTo)} aria-label={`${link.label}: ${issue.title}`}>{link.label}</Link>
          {issue.kind === "published-lesson" && issue.accountId && <Link className={styles.relatedRecord} to={withChecksReturn(`/admin/accounts?account=${encodeURIComponent(issue.accountId)}`, returnTo)}>Учётная запись преподавателя</Link>}
        </div>
      </article>;
    })}</section> : <div className={styles.empty}><strong>{filtered ? "По этим условиям записей нет" : "По выполненным проверкам замечаний нет"}</strong><p>{filtered ? "Измените поиск или сбросьте фильтры выше." : "Расписание перед публикацией проверяется отдельно."}</p></div>}
    {snapshot.pages > 1 && <nav className={styles.pagination} aria-label="Страницы проверки данных"><span>{(snapshot.page - 1) * ADMINISTRATION_CHECK_PAGE_SIZE + 1}–{Math.min(snapshot.page * ADMINISTRATION_CHECK_PAGE_SIZE, snapshot.total)} из {snapshot.total}</span><button type="button" disabled={snapshot.page === 1} onClick={() => onPage(snapshot.page - 1)}>Назад</button><span>{snapshot.page} / {snapshot.pages}</span><button type="button" disabled={snapshot.page === snapshot.pages} onClick={() => onPage(snapshot.page + 1)}>Далее</button></nav>}
  </>;
}
