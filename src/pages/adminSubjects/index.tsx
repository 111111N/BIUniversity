import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAcademicGroup, getSubjectGroups } from "../../data/academicCatalog";
import { accountService, readAccountsState } from "../../data/accountStore";
import { readSubjectCatalogState, subjectCatalogService } from "../../data/subjectCatalogStore";
import { isAccountActive, replaceSubjectTeachingGroups, type PortalAccount } from "../../domain/accounts";
import { matchesSearchText } from "../../domain/search";
import { changesAdminSubject } from "../../domain/unsavedNavigation";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useSubjectCatalog } from "../../hooks/useSubjectCatalog";
import Dropdown from "../../components/Dropdown";
import SearchMultiSelect from "../../components/SearchMultiSelect";
import SearchField from "../../components/SearchField";
import ConfirmDialog from "../../components/ConfirmDialog";
import styles from "./index.module.scss";
import { isGroupActive } from "../../domain/groupCatalog";

type AssignmentEditor = { subjectId: string; account: PortalAccount; groups: string[]; revision: number; actorRevision: number };
type SubjectEditor = { name: string; shortName: string; revision: number; actorRevision: number };
const TEACHERS_PER_PAGE = 12;

const AdminSubjectsPage = () => {
  const { currentUser, accounts, accountError, role } = useRole();
  const { subjects, error: catalogError } = useSubjectCatalog();
  const { requestAction } = useUnsavedChangesGuard();
  const [params, setParams] = useSearchParams();
  const subjectId = params.get("subject");
  const subject = subjects.find((item) => item.id === subjectId);
  const query = params.get("q") ?? "";
  const requestedPage = Number(params.get("page") ?? "1");
  const [formOpen, setFormOpen] = useState(false);
  const [editorState, setEditor] = useState<AssignmentEditor | null>(null);
  const [subjectEditor, setSubjectEditor] = useState<SubjectEditor | null>(null);
  const creatingSubject = Boolean(subjectEditor);
  const editorRef = useRef<HTMLFormElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [createdSubjectId, setCreatedSubjectId] = useState<string | null>(null);
  const editor = editorState?.subjectId === subjectId ? editorState : null;
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const teachers = useMemo(() => accounts.filter((account) => account.role === "teacher"), [accounts]);
  const assignedTeachers = teachers.filter((account) => account.memberships.some((entry) => entry.subjectId === subject?.id && entry.groupIds.length));
  const filteredTeachers = assignedTeachers.filter((account) => matchesSearchText([
    account.name, account.login, account.email ?? "",
    ...(account.memberships.find((entry) => entry.subjectId === subject?.id)?.groupIds ?? []).map((id) => getAcademicGroup(id)?.name ?? id),
  ].join(" "), query));
  const pageCount = Math.max(1, Math.ceil(filteredTeachers.length / TEACHERS_PER_PAGE));
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, pageCount);
  const shownTeachers = filteredTeachers.slice((page - 1) * TEACHERS_PER_PAGE, page * TEACHERS_PER_PAGE);
  const assignedGroups = new Set(assignedTeachers.flatMap((account) => account.memberships.find((entry) => entry.subjectId === subject?.id)?.groupIds ?? []));
  const groupOptions = subject ? getSubjectGroups(subject.id).filter(isGroupActive).map((group) => ({ value: group.id, label: group.name })) : [];
  const previousGroups = editor?.account.memberships.find((entry) => entry.subjectId === editor.subjectId)?.groupIds ?? [];
  const dirty = Boolean(editor && (editor.groups.length !== previousGroups.length || editor.groups.some((id) => !previousGroups.includes(id))));
  const removedGroups = previousGroups.filter((id) => !editor?.groups.includes(id));
  const subjectDirty = Boolean(subjectEditor && (subjectEditor.name.trim() || subjectEditor.shortName.trim()));
  const unavailable = Boolean(accountError || catalogError);
  useUnsavedChangesWarning(dirty || subjectDirty || busy, changesAdminSubject);
  useEffect(() => {
    if (formOpen || creatingSubject) editorRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    else if (returnFocusRef.current) {
      if (returnFocusRef.current.isConnected) returnFocusRef.current.focus({ preventScroll: true });
      returnFocusRef.current = null;
    }
  }, [formOpen, creatingSubject]);
  useEffect(() => { setEditor(null); setFormOpen(false); setConfirm(false); setError(""); }, [subjectId]);
  useEffect(() => {
    if (!createdSubjectId || subjectEditor || busy) return;
    // Navigate only after the saved form has released its unsaved-changes guard.
    setParams((previous) => { const next = new URLSearchParams(previous); next.set("subject", createdSubjectId); next.delete("q"); next.delete("page"); return next; });
    setCreatedSubjectId(null);
  }, [createdSubjectId, subjectEditor, busy, setParams]);

  const selectSubject = (id: string) => {
    if (id === subject?.id || busy) return;
    requestAction(() => {
      setEditor(null); setSubjectEditor(null); setFormOpen(false); setError(""); setMessage(""); setConfirm(false);
      setParams((previous) => { const next = new URLSearchParams(previous); next.set("subject", id); next.delete("q"); next.delete("page"); return next; });
    });
  };
  const rememberTrigger = () => {
    if (!formOpen && !subjectEditor) returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
  const editTeacher = (id: string) => {
    if (!subject || busy) return;
    requestAction(() => {
      const snapshot = readAccountsState();
      const account = snapshot.accounts.find((entry) => entry.id === id && entry.role === "teacher");
      const actor = snapshot.accounts.find((entry) => entry.id === currentUser.id);
      if (snapshot.error || !account || !actor) { setError(snapshot.error || "Учётная запись изменилась. Обновите список преподавателей."); return; }
      rememberTrigger();
      setEditor({ subjectId: subject.id, account, groups: [...(account.memberships.find((entry) => entry.subjectId === subject.id)?.groupIds ?? [])], revision: snapshot.revision, actorRevision: actor.revision });
      setSubjectEditor(null); setFormOpen(true); setError(""); setMessage(""); setConfirm(false);
    });
  };
  const openNew = () => requestAction(() => { rememberTrigger(); setEditor(null); setSubjectEditor(null); setFormOpen(true); setError(""); setMessage(""); });
  const closeEditor = () => requestAction(() => { setEditor(null); setSubjectEditor(null); setFormOpen(false); setError(""); setConfirm(false); });
  const openSubjectCreation = () => requestAction(() => {
    const snapshot = readSubjectCatalogState();
    const accountSnapshot = readAccountsState();
    const actor = accountSnapshot.accounts.find((entry) => entry.id === currentUser.id);
    if (snapshot.error || accountSnapshot.error || !actor) { setError(snapshot.error || accountSnapshot.error || "Учётная запись изменилась. Обновите страницу."); return; }
    rememberTrigger();
    setEditor(null); setFormOpen(false); setError(""); setMessage(""); setConfirm(false);
    setSubjectEditor({ name: "", shortName: "", revision: snapshot.revision, actorRevision: actor.revision });
  });
  const createSubject = async (event: FormEvent) => {
    event.preventDefault();
    if (!subjectEditor || busy || unavailable) return;
    setBusy(true); setError("");
    try {
      const created = await subjectCatalogService.create({ actorId: currentUser.id, actorRevision: subjectEditor.actorRevision, expectedRevision: subjectEditor.revision, draft: { name: subjectEditor.name, shortName: subjectEditor.shortName } });
      setSubjectEditor(null); setEditor(null); setFormOpen(false);
      setCreatedSubjectId(created.id);
      setMessage(`Дисциплина «${created.name}» создана. Теперь назначьте преподавателя и его группы.`);
    } catch (failure) { console.error("Не удалось создать дисциплину:", failure); setError(failure instanceof Error ? failure.message : "Не удалось создать дисциплину. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!subject || !editor || busy || !dirty || unavailable) return;
    setBusy(true); setError("");
    try {
      await accountService.updateAssignments({ actorId: currentUser.id, actorRevision: editor.actorRevision, expectedRevision: editor.revision, accountId: editor.account.id, accountRevision: editor.account.revision, memberships: replaceSubjectTeachingGroups(editor.account.memberships, subject.id, editor.groups) });
      setMessage(editor.groups.length ? `Назначения сохранены: ${editor.account.name}.` : `Назначение снято: ${editor.account.name}.`);
      setEditor(null); setFormOpen(false); setConfirm(false);
    } catch (failure) { console.error("Не удалось сохранить преподавателей дисциплины:", failure); setError(failure instanceof Error ? failure.message : "Не удалось сохранить назначения. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (removedGroups.length) setConfirm(true); else void save(); };
  const setQuery = (value: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    if (value) next.set("q", value); else next.delete("q");
    next.delete("page"); return next;
  }, { replace: true });
  const setPage = (value: number) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    if (value > 1) next.set("page", String(value)); else next.delete("page");
    return next;
  });

  if (role !== "configurator") return <div className={styles.empty}>Управление дисциплинами доступно настройщику.</div>;
  return <div className={`pageContainer ${styles.page}`}>
    <div className={styles.catalog}>
      <Dropdown label="Поиск дисциплины" placeholder="" searchable value={subject?.id ?? ""} options={subjects.map((item) => ({ value: item.id, label: item.name, searchText: item.shortName }))} onChange={selectSubject} disabled={busy || Boolean(catalogError)} />
      <button type="button" className={styles.primary} disabled={busy || unavailable} onClick={openSubjectCreation}>Создать дисциплину</button>
    </div>
    {accountError && <p className={styles.error} role="alert">{accountError}</p>}
    {catalogError && <p className={styles.error} role="alert">{catalogError}</p>}
    {error && !confirm && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {subjectEditor && <form ref={editorRef} className={styles.editor} aria-label="Новая дисциплина" onSubmit={(event) => void createSubject(event)}>
      <div className={styles.editorHeader}><h2>Новая дисциплина</h2><button type="button" disabled={busy} onClick={closeEditor}>Закрыть</button></div>
      <fieldset className={styles.subjectFields} disabled={busy || unavailable}>
        <label>Название дисциплины<input required minLength={2} maxLength={160} value={subjectEditor.name} onChange={(event) => setSubjectEditor((previous) => previous ? { ...previous, name: event.target.value } : previous)} autoComplete="off" /></label>
        <label>Краткое название<input required minLength={1} maxLength={24} value={subjectEditor.shortName} onChange={(event) => setSubjectEditor((previous) => previous ? { ...previous, shortName: event.target.value } : previous)} autoComplete="off" /></label>
      </fieldset>
      <p className={styles.note}>Краткое название используется в компактных карточках. Преподавателей и группы можно назначить после создания.</p>
      <div className={styles.formActions}><button type="submit" className={styles.primary} disabled={busy || unavailable || !subjectEditor.name.trim() || !subjectEditor.shortName.trim()}>{busy ? "Создаём…" : "Создать дисциплину"}</button></div>
    </form>}
    {subject && !subjectEditor ? <section className={styles.content} aria-label={`Преподаватели: ${subject.name}`}>
      <div className={styles.header}><div><h2>{subject.name}</h2><p>Преподавателей: {assignedTeachers.length} · Групп: {assignedGroups.size}</p></div><button type="button" className={styles.primary} disabled={busy || unavailable || !teachers.length} onClick={openNew}>Назначить преподавателя</button></div>
      {formOpen && <form ref={editorRef} className={styles.editor} aria-label="Назначение преподавателя на дисциплину" onSubmit={submit}>
        <div className={styles.editorHeader}><h3>Преподаватель и группы</h3><button type="button" disabled={busy} onClick={closeEditor}>Закрыть</button></div>
        <Dropdown label="Преподаватель дисциплины" searchable value={editor?.account.id ?? ""} options={teachers.map((account) => ({ value: account.id, label: `${account.name} · ${account.login}${isAccountActive(account) ? "" : " · заблокирован"}` }))} onChange={editTeacher} disabled={busy || unavailable} placeholder="" />
        {editor ? <>
          <SearchMultiSelect key={editor.account.id} label="Поиск учебных групп" options={groupOptions} value={editor.groups} onChange={(groups) => setEditor((previous) => previous ? { ...previous, groups } : previous)} disabled={busy || unavailable} />
          <p className={styles.note}>Назначения по другим дисциплинам сохранятся. Пустой выбор снимает назначение по этой дисциплине.</p>
          <div className={styles.formActions}><button className={styles.primary} type="submit" disabled={busy || !dirty || unavailable}>{busy ? "Сохраняем…" : !editor.groups.length && previousGroups.length ? "Снять назначение" : "Сохранить назначения"}</button></div>
        </> : <p className={styles.note}>Выберите преподавателя, затем найдите его учебные группы.</p>}
      </form>}
      {assignedTeachers.length > 0 && <div className={styles.listTools}>
        <SearchField label="Поиск преподавателя или группы" placeholder="" value={query} onChange={setQuery} />
        <div className={styles.results}>
          <p role="status">{filteredTeachers.length ? `${(page - 1) * TEACHERS_PER_PAGE + 1}–${Math.min(page * TEACHERS_PER_PAGE, filteredTeachers.length)} из ${filteredTeachers.length}` : "Ничего не найдено"}{query.trim() && ` · Всего преподавателей: ${assignedTeachers.length}`}</p>
          {pageCount > 1 && <nav className={styles.pagination} aria-label="Страницы преподавателей">
            <button type="button" aria-label="Предыдущая страница преподавателей" disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</button>
            <span aria-label={`Страница ${page} из ${pageCount}`}>{page} / {pageCount}</span>
            <button type="button" aria-label="Следующая страница преподавателей" disabled={page === pageCount} onClick={() => setPage(page + 1)}>Далее</button>
          </nav>}
        </div>
      </div>}
      <div className={styles.list}>{shownTeachers.map((account) => {
        const groups = account.memberships.find((entry) => entry.subjectId === subject.id)?.groupIds ?? [];
        return <article key={account.id} className={styles.teacher}>
          <div className={styles.teacherHeader}><div><strong>{account.name}</strong><span>{account.login}</span>{!isAccountActive(account) && <span className={styles.blocked}>Учётная запись заблокирована</span>}</div><button type="button" disabled={busy || unavailable} aria-label={`Изменить группы: ${account.name}`} onClick={() => editTeacher(account.id)}>Изменить группы</button></div>
          <div className={styles.tags}>{groups.slice(0, 5).map((id) => <span key={id}>{getAcademicGroup(id)?.name ?? id}</span>)}</div>
          {groups.length > 5 && <details className={styles.moreGroups}><summary>Ещё групп: {groups.length - 5}</summary><div className={styles.tags}>{groups.slice(5).map((id) => <span key={id}>{getAcademicGroup(id)?.name ?? id}</span>)}</div></details>}
        </article>;
      })}</div>
      {assignedTeachers.length > 0 && !filteredTeachers.length && <div className={styles.empty}><strong>Назначения не найдены</strong><p>Попробуйте другую фамилию, логин или название группы.</p><button type="button" onClick={() => setQuery("")}>Сбросить поиск</button></div>}
      {!assignedTeachers.length && !unavailable && <div className={styles.empty}>{teachers.length ? <>Преподаватели пока не назначены.<br />Выберите преподавателя и его группы.</> : <>Сначала создайте учётную запись преподавателя в разделе <Link to="/admin/accounts">«Учётные записи»</Link>.</>}</div>}
    </section> : !subjectEditor && !catalogError && <div className={styles.empty}><strong>{subjectId ? "Дисциплина не найдена" : "Выберите дисциплину"}</strong><p>{subjectId ? "Найдите другую дисциплину через поиск или создайте новую." : "Найдите дисциплину по названию, чтобы назначить преподавателей и группы. Новую дисциплину можно создать кнопкой выше."}</p></div>}
    {confirm && editor && subject && <ConfirmDialog title="Изменить группы преподавателя?" confirmLabel={editor.groups.length ? "Сохранить назначения" : "Снять назначение"} busy={busy} error={error} onCancel={() => { setConfirm(false); setError(""); }} onConfirm={() => void save()}><p>{editor.account.name} · {subject.name}</p><p>Снимаются группы: {removedGroups.map((id) => getAcademicGroup(id)?.name ?? id).join(", ")}.</p><p>Доступ к этим группам обновится сразу.</p></ConfirmDialog>}
  </div>;
};
export default AdminSubjectsPage;
