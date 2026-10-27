import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import { useSubjectCatalog } from "../../hooks/useSubjectCatalog";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import { accountService } from "../../data/accountStore";
import { TEACHER_REGISTRY_PAGE_SIZE, type TeacherRegistryQuery, type TeacherRegistryResult } from "../../domain/teacherRegistry";
import Dropdown from "../../components/Dropdown";
import SearchField from "../../components/SearchField";
import styles from "./index.module.scss";

const emptyResult: TeacherRegistryResult = { rows: [], total: 0, totalTeachers: 0, withoutAssignments: 0, page: 1, pages: 1 };
export default function AdminTeachersPage() {
  const { currentUser, accounts, accountError } = useRole();
  const catalog = useSubjectCatalog();
  const groups = useGroupCatalog();
  const [params, setParams] = useSearchParams();
  const query = useMemo<TeacherRegistryQuery>(() => ({ q: params.get("q") ?? "", subject: params.get("subject") ?? "all", group: params.get("group") ?? "all", access: params.get("access") ?? "all", assignments: params.get("assignments") ?? "all", page: Number(params.get("page") ?? 1) }), [params]);
  const [result, setResult] = useState<{ key: object; listing: TeacherRegistryResult } | null>(null);
  const [failure, setFailure] = useState<{ key: object; message: string } | null>(null);
  const [reload, setReload] = useState(0);
  const actorRevision = accounts.find((account) => account.id === currentUser.id)?.revision ?? 0;
  const key = useMemo(() => ({ query, accounts, catalogRevision: catalog.revision, groupRevision: groups.revision, catalogError: catalog.error, groupError: groups.error, actorId: currentUser.id, reload }), [query, accounts, catalog.revision, groups.revision, catalog.error, groups.error, currentUser.id, reload]);
  const listing = result?.key === key ? result.listing : emptyResult;
  const error = accountError || catalog.error || groups.error || (failure?.key === key ? failure.message : "");
  const loading = !error && result?.key !== key;
  useEffect(() => {
    let current = true;
    void accountService.listTeachers({ actorId: currentUser.id, actorRevision, query }).then((next) => {
      if (current) setResult({ key, listing: next });
    }).catch((reason) => {
      console.error("Не удалось загрузить страницу преподавателей:", reason);
      if (current) setFailure({ key, message: reason instanceof Error ? reason.message : "Не удалось загрузить преподавателей." });
    });
    return () => { current = false; };
  }, [key, currentUser.id, actorRevision, query]);
  const filter = (name: keyof TeacherRegistryQuery, value: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    if (!value || value === "all") next.delete(name); else next.set(name, value);
    next.delete("page"); return next;
  }, { replace: true });
  const page = (value: number) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    if (value > 1) next.set("page", String(value)); else next.delete("page");
    return next;
  });
  const filtered = query.q !== "" || [query.subject, query.group, query.access, query.assignments].some((value) => value !== "all");
  return <div className={`pageContainer ${styles.page}`}>
    <div className={styles.topline}>
      <p>Преподаватели{!loading && !error && ` · ${listing.totalTeachers}`}</p>
      <Link className={styles.primary} to="/admin/accounts?create=teacher&type=teacher">Создать преподавателя</Link>
    </div>
    <SearchField label="Поиск по ФИО, логину, почте, дисциплине или группе" placeholder="" value={query.q} onChange={(value) => filter("q", value)} />
    <div className={styles.filters}>
      <Dropdown label="Дисциплина" searchable placeholder="" value={query.subject} options={[{ value: "all", label: "Все дисциплины" }, ...catalog.subjects.map((subject) => ({ value: subject.id, label: subject.name, searchText: subject.shortName }))]} onChange={(value) => filter("subject", value)} />
      <Dropdown label="Группа" searchable placeholder="" value={query.group} options={[{ value: "all", label: "Все группы" }, ...groups.groups.map((group) => ({ value: group.id, label: `${group.name}${group.status === "archived" ? " · архив" : ""}`, searchText: group.previousNames?.join(" ") }))]} onChange={(value) => filter("group", value)} />
      <Dropdown label="Назначения" value={query.assignments} options={[{ value: "all", label: "Все преподаватели" }, { value: "none", label: "Без назначений" }, { value: "assigned", label: "Есть назначения" }]} onChange={(value) => filter("assignments", value)} />
      <Dropdown label="Доступ" value={query.access} options={[{ value: "all", label: "Любой" }, { value: "active", label: "Открыт" }, { value: "blocked", label: "Заблокирован" }]} onChange={(value) => filter("access", value)} />
    </div>
    {error ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" onClick={() => { catalog.refresh(); groups.refresh(); setReload((value) => value + 1); }}>Повторить чтение</button></div> : <>
      <div className={styles.resultLine}>
        <p role="status">{loading ? "Загружаем преподавателей…" : `Найдено: ${listing.total} · Без назначений во всём реестре: ${listing.withoutAssignments}`}</p>
        {filtered && <button type="button" onClick={() => setParams({}, { replace: true })}>Сбросить фильтры</button>}
      </div>
      <section className={styles.rows} aria-label="Реестр преподавателей" aria-busy={loading}>
        {listing.rows.map((row) => <article key={row.accountId} className={styles.teacher}>
          <div className={styles.identity}><h2>{row.name}</h2><span>{row.login}</span><span>{row.email ?? "Почта не указана"}</span><span className={row.access === "blocked" ? styles.blocked : undefined}>{row.access === "blocked" ? "Доступ заблокирован" : "Доступ открыт"}</span></div>
          <div className={styles.assignments}><p>Дисциплин: <strong>{row.subjectCount}</strong> · Групп: <strong>{row.groupCount}</strong></p>
            {row.subjects.length ? <ul>{row.subjects.map((subject) => <li key={subject.id}><Link to={`/admin/subjects?subject=${encodeURIComponent(subject.id)}&teacher=${encodeURIComponent(row.accountId)}`}>{subject.name}</Link></li>)}</ul> : <p className={styles.note}>Дисциплины и группы ещё не назначены</p>}
            {row.subjectCount > row.subjects.length && <p className={styles.note}>Ещё дисциплин: {row.subjectCount - row.subjects.length}</p>}
          </div>
          <div className={styles.actions}><Link to={`/admin/subjects?teacher=${encodeURIComponent(row.accountId)}`}>Назначения</Link><Link to={`/admin/accounts?account=${encodeURIComponent(row.accountId)}`}>Учётная запись</Link></div>
        </article>)}
      </section>
      {!loading && !listing.total && <div className={styles.empty}><strong>{filtered ? "Преподаватели не найдены" : "Преподавателей пока нет"}</strong><p>{filtered ? "Измените поиск или сбросьте фильтры." : "Создайте учётную запись, затем назначьте дисциплины и группы."}</p></div>}
      {!loading && listing.total > 0 && <nav className={styles.pagination} aria-label="Страницы реестра преподавателей"><span>{(listing.page - 1) * TEACHER_REGISTRY_PAGE_SIZE + 1}–{Math.min(listing.page * TEACHER_REGISTRY_PAGE_SIZE, listing.total)} из {listing.total}</span><button type="button" disabled={listing.page === 1} onClick={() => page(listing.page - 1)}>Назад</button><span>{listing.page} / {listing.pages}</span><button type="button" disabled={listing.page === listing.pages} onClick={() => page(listing.page + 1)}>Далее</button></nav>}
    </>}
  </div>;
}
