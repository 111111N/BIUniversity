import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Link from "../../components/ChecksContextLink";
import { getAcademicGroup, getSubjectGroups } from "../../data/academicCatalog";
import { accountService, readAccountsState } from "../../data/accountStore";
import { readSubjectCatalogState, subjectCatalogService } from "../../data/subjectCatalogStore";
import { isAccountActive, replaceSubjectTeachingGroups } from "../../domain/accounts";
import { matchesSearchText } from "../../domain/search";
import { changesAdminSubject } from "../../domain/unsavedNavigation";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useSubjectCatalog } from "../../hooks/useSubjectCatalog";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import { readGroupCatalogState } from "../../data/groupCatalogStore";
import Dropdown from "../../components/Dropdown";
import SearchMultiSelect from "../../components/SearchMultiSelect";
import SearchField from "../../components/SearchField";
import ConfirmDialog from "../../components/ConfirmDialog";
import styles from "./index.module.scss";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import AssignmentChanges from "./AssignmentChanges";
import { isGroupActive } from "../../domain/groupCatalog";
import { useScheduleAssignmentHandoff } from "../../components/ScheduleAssignmentProvider";
import { SCHEDULE_RETURN_PARAM } from "../../domain/scheduleAssignmentHandoff";
import { parseCalendarDate } from "../../domain/calendar";
import AssignmentTeacher from "./AssignmentTeacher";
import AdministrationReturnNotice from "../../components/AdministrationReturnNotice";
import { isAssignmentEditorStale, makeAssignmentEditor, type AssignmentEditor } from "./assignmentEditorModel";
import SubjectCreationForm from "./SubjectCreationForm";

type SubjectEditor = { name: string; shortName: string; revision: number; actorId: string; actorRevision: number };
const TEACHERS_PER_PAGE = 12;

const readAssignmentEditor = (actorId: string, subjectId: string, teacherId: string) => {
  const snapshot = readAccountsState();
  const catalog = readSubjectCatalogState();
  const groups = readGroupCatalogState();
  if (snapshot.error || catalog.error || groups.error) throw new Error(snapshot.error || catalog.error || groups.error);
  if (!catalog.subjects.some((subject) => subject.id === subjectId)) throw new Error("Дисциплина недоступна. Выберите другую дисциплину.");
  return makeAssignmentEditor({ ...snapshot, actorId, catalogRevision: catalog.revision, groupRevision: groups.revision }, subjectId, teacherId);
};

const AdminSubjectsPage = () => {
  const { currentUser, accounts, accountError, role, refreshAccounts } = useRole();
  const { subjects, error: catalogError, revision: catalogRevision, refresh: refreshCatalog } = useSubjectCatalog();
  const groupCatalog = useGroupCatalog();
  const { requestAction: guardAction } = useUnsavedChangesGuard();
  const { store: handoff, pending } = useScheduleAssignmentHandoff();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scheduleContext = pending && handoff.matchesSubjects({ pathname: "/admin/subjects", search: params.toString() }) ? pending : null;
  const openedHandoff = useRef<string | null>(null);
  const subjectId = params.get("subject");
  const teacherId = params.get("teacher");
  const selectedTeacher = accounts.find((account) => account.id === teacherId && account.role === "teacher");
  const subject = subjects.find((item) => item.id === subjectId);
  const query = teacherId ? "" : params.get("q") ?? "";
  const requestedPage = Number(params.get("page") ?? "1");
  const [formOpen, setFormOpen] = useState(false);
  const [choosingTeacher, setChoosingTeacher] = useState(false);
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
  const filteredTeachers = assignedTeachers.filter((account) => (!teacherId || account.id === teacherId) && matchesSearchText([
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
  const accountsState = readAccountsState();
  const sourceError = accountError || catalogError || groupCatalog.error || accountsState.error;
  const unavailable = Boolean(sourceError);
  const assignmentStale = Boolean(editor && isAssignmentEditorStale(editor, { ...accountsState, actorId: currentUser.id, catalogRevision, groupRevision: groupCatalog.revision }));
  const actor = accountsState.accounts.find((entry) => entry.id === currentUser.id);
  const subjectStale = Boolean(subjectEditor && (subjectEditor.actorId !== currentUser.id || subjectEditor.actorRevision !== actor?.revision || subjectEditor.revision !== catalogRevision || actor?.role !== "configurator" || !isAccountActive(actor)));
  // Local form actions keep the suspended pair; only this form's edits need confirmation.
  const requestAction = (action: () => void) => { if (dirty || subjectDirty || busy) guardAction(action); else action(); };
  useUnsavedChangesWarning(dirty || subjectDirty || busy, changesAdminSubject);
  useEffect(() => {
    if (formOpen || creatingSubject) editorRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    else if (returnFocusRef.current) {
      if (returnFocusRef.current.isConnected) returnFocusRef.current.focus();
      returnFocusRef.current = null;
    }
  }, [formOpen, creatingSubject]);
  useEffect(() => { setEditor(null); setFormOpen(false); setChoosingTeacher(false); setConfirm(false); setError(""); }, [subjectId, teacherId]);
  useEffect(() => {
    if (!scheduleContext || !subject || subject.id !== scheduleContext.editor.subjectId || unavailable || openedHandoff.current === scheduleContext.token) return;
    openedHandoff.current = scheduleContext.token;
    if (teacherId) {
      try { setEditor(readAssignmentEditor(currentUser.id, subject.id, teacherId)); }
      catch (failure) { console.error("Не удалось открыть назначения для пары:", failure); setError(failure instanceof Error ? failure.message : "Не удалось открыть назначения. Обновите данные."); }
    }
    setChoosingTeacher(false); setFormOpen(true);
  }, [scheduleContext, subject, unavailable, teacherId, currentUser.id]);
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
      try {
        const nextEditor = readAssignmentEditor(currentUser.id, subject.id, id);
        rememberTrigger();
        refreshAccounts(); refreshCatalog(); groupCatalog.refresh();
        setEditor(nextEditor); setChoosingTeacher(false);
        setSubjectEditor(null); setFormOpen(true); setError(""); setMessage(""); setConfirm(false);
      } catch (failure) { console.error("Не удалось открыть назначения преподавателя:", failure); setError(failure instanceof Error ? failure.message : "Не удалось открыть назначения. Текущий ввод сохранён."); }
    });
  };
  const openNew = () => requestAction(() => { rememberTrigger(); setEditor(null); setSubjectEditor(null); setChoosingTeacher(false); setFormOpen(true); setError(""); setMessage(""); });
  const closeEditor = () => requestAction(() => { setEditor(null); setSubjectEditor(null); setChoosingTeacher(false); setFormOpen(false); setError(""); setConfirm(false); });
  const openSubjectCreation = () => requestAction(() => {
    const snapshot = readSubjectCatalogState();
    const accountSnapshot = readAccountsState();
    const actor = accountSnapshot.accounts.find((entry) => entry.id === currentUser.id);
    if (snapshot.error || accountSnapshot.error || !actor) { setError(snapshot.error || accountSnapshot.error || "Учётная запись изменилась. Обновите страницу."); return; }
    rememberTrigger();
    setEditor(null); setFormOpen(false); setError(""); setMessage(""); setConfirm(false);
    setSubjectEditor({ name: "", shortName: "", revision: snapshot.revision, actorId: actor.id, actorRevision: actor.revision });
  });
  const refreshSubjectCheck = () => {
    const snapshot = readSubjectCatalogState();
    const accountSnapshot = readAccountsState();
    const latestActor = accountSnapshot.accounts.find((entry) => entry.id === currentUser.id);
    if (snapshot.error || accountSnapshot.error || !latestActor || latestActor.role !== "configurator" || !isAccountActive(latestActor)) { setError(snapshot.error || accountSnapshot.error || "Обновите учётную запись активного настройщика."); return; }
    refreshAccounts(); refreshCatalog(); groupCatalog.refresh();
    setSubjectEditor((previous) => previous ? { ...previous, actorId: latestActor.id, actorRevision: latestActor.revision, revision: snapshot.revision } : previous);
    setError("");
  };
  const createSubject = async (event: FormEvent) => {
    event.preventDefault();
    if (!subjectEditor || busy || unavailable || subjectStale) return;
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
    if (!subject || !editor || busy || !dirty || unavailable || assignmentStale || choosingTeacher) return;
    setBusy(true); setError("");
    try {
      await accountService.updateAssignments({ actorId: currentUser.id, actorRevision: editor.actorRevision, expectedRevision: editor.revision, accountId: editor.account.id, accountRevision: editor.account.revision, memberships: replaceSubjectTeachingGroups(editor.account.memberships, subject.id, editor.groups) });
      setMessage(editor.groups.length ? `Назначения сохранены: ${editor.account.name}.` : `Назначение снято: ${editor.account.name}.`);
      setEditor(null); setFormOpen(false); setConfirm(false);
    } catch (failure) { console.error("Не удалось сохранить преподавателей дисциплины:", failure); setError(failure instanceof Error ? failure.message : "Не удалось сохранить назначения. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (!editor || busy || !dirty || unavailable || assignmentStale || choosingTeacher) return; if (removedGroups.length) setConfirm(true); else void save(); };
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
    <AdministrationReturnNotice />
    {scheduleContext && <section className={styles.scheduleContext} aria-label="Возврат к паре">
      <div><strong>Назначение для пары</strong><p>{subjects.find((item) => item.id === scheduleContext.editor.subjectId)?.name ?? "Дисциплина недоступна"} · {getAcademicGroup(scheduleContext.groupId)?.name ?? scheduleContext.groupId}</p><p>{parseCalendarDate(scheduleContext.editor.date)?.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) ?? "Дата не выбрана"} · {scheduleContext.editor.startsAt || "Время не выбрано"}</p><p>Ввод пары и правки недели сохранены в этой вкладке до возврата. Перед обновлением страницы вернитесь к паре и сохраните черновик.</p>{(dirty || subjectDirty) && <p>Назначения ещё не сохранены. Сохраните их перед возвратом.</p>}</div>
      <button type="button" disabled={busy} onClick={() => { const url = handoff.returnUrl(); if (url) navigate(url); }}>Вернуться к паре</button>
    </section>}
    {params.has(SCHEDULE_RETURN_PARAM) && !scheduleContext && <p className={styles.error} role="status">Временный ввод пары недоступен после перезагрузки или смены пользователя. Назначения можно изменить здесь; расписание затем нужно открыть заново.</p>}
    <div hidden={formOpen || creatingSubject} className={styles.catalog}>
      <Dropdown label="Поиск дисциплины" placeholder="" searchable value={subject?.id ?? ""} options={subjects.map((item) => ({ value: item.id, label: item.name, searchText: item.shortName }))} onChange={selectSubject} disabled={busy || Boolean(catalogError)} />
      <button type="button" className={styles.primary} disabled={busy || unavailable} onClick={openSubjectCreation}>Создать дисциплину</button>
    </div>
    {teacherId && <section hidden={formOpen || creatingSubject} className={`${styles.editor} ${styles.teacherScope}`} aria-label="Выбранный преподаватель">
      <div className={styles.editorHeader}><div><strong>{selectedTeacher?.name ?? "Преподаватель недоступен"}</strong><p className={styles.note}>{selectedTeacher ? `${selectedTeacher.login} · ${isAccountActive(selectedTeacher) ? "Доступ открыт" : "Доступ заблокирован"}` : "Учётная запись удалена или её тип изменён. Выберите другого преподавателя."}</p></div><button type="button" disabled={busy} onClick={() => requestAction(() => { setEditor(null); setFormOpen(false); setConfirm(false); setParams((previous) => { const next = new URLSearchParams(previous); next.delete("teacher"); next.delete("q"); next.delete("page"); return next; }); })}>Сменить преподавателя</button></div>
      <Link to="/admin/teachers">← Реестр преподавателей</Link>
      {selectedTeacher && !subject && <p className={styles.note}>Найдите дисциплину выше, чтобы проверить или изменить группы преподавателя.</p>}
    </section>}
    {sourceError && <div className={styles.error} role="alert"><p>{sourceError}</p><button type="button" disabled={busy} onClick={() => { refreshAccounts(); refreshCatalog(); groupCatalog.refresh(); }}>Повторить чтение</button></div>}
    {error && !confirm && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {subjectEditor && <RecordEditor title="Новая дисциплина" context="Создание в каталоге дисциплин" dirty={subjectDirty} busy={busy} onClose={closeEditor}>
      {subjectStale && <div className={styles.sourceNotice} role="alert"><p>Каталог или права изменились. Обновите проверку перед созданием. Название и сокращение останутся в форме.</p><button type="button" disabled={busy} onClick={refreshSubjectCheck}>Обновить проверку</button></div>}
      <SubjectCreationForm formRef={editorRef} draft={subjectEditor} subjects={subjects} disabled={unavailable} stale={subjectStale} busy={busy} onChange={(draft) => { setSubjectEditor((previous) => previous ? { ...previous, ...draft } : previous); setError(""); setMessage(""); }} onSubmit={(event) => void createSubject(event)} onCancel={closeEditor} />
    </RecordEditor>}
    {subject && !subjectEditor ? <section className={styles.content} aria-label={`Преподаватели: ${subject.name}`}>
      <div hidden={formOpen} className={styles.header}><div><h2>{subject.name}</h2><p>Преподавателей: {assignedTeachers.length} · Групп: {assignedGroups.size}</p></div><button type="button" className={styles.primary} disabled={busy || unavailable || !teachers.length || Boolean(teacherId && !selectedTeacher)} onClick={() => selectedTeacher ? editTeacher(selectedTeacher.id) : openNew()}>{selectedTeacher ? "Изменить назначения" : "Назначить преподавателя"}</button></div>
      {formOpen && <RecordEditor title="Назначения преподавателя" context={subject.name} dirty={dirty} busy={busy} closeLabel="К назначениям" onClose={closeEditor}>
        {assignmentStale && <div className={styles.sourceNotice} role="alert"><p>Назначения, справочники или права изменились. Текущий выбор групп оставлен в форме. Перед сохранением загрузите актуальные назначения; отказ от изменённого выбора потребует подтверждения.</p><button type="button" disabled={busy || unavailable} onClick={() => editor && editTeacher(editor.account.id)}>Загрузить актуальные назначения</button></div>}
        <form ref={editorRef} aria-label="Назначение преподавателя на дисциплину" onSubmit={submit}>
          <AssignmentTeacher teacher={editor?.account} teachers={teachers} choosing={!editor || choosingTeacher} canChange={!selectedTeacher || Boolean(scheduleContext)} disabled={busy || unavailable} onStart={() => setChoosingTeacher(true)} onCancel={() => setChoosingTeacher(false)} onChoose={(id) => { if (id === editor?.account.id) setChoosingTeacher(false); else editTeacher(id); }} />
          {editor ? <div className={styles.groupEditor} hidden={choosingTeacher}>
            {!isAccountActive(editor.account) && <p className={styles.error} role="status">Доступ преподавателя заблокирован. Его назначения сохраняются, но в выборе преподавателя для пары он не появится до восстановления доступа.</p>}
            {scheduleContext && subject.id === scheduleContext.editor.subjectId && !editor.groups.includes(scheduleContext.groupId) && <div className={styles.targetGroup}><span>Для пары нужна группа «{getAcademicGroup(scheduleContext.groupId)?.name ?? scheduleContext.groupId}».</span><button type="button" disabled={busy || unavailable || !groupOptions.some((option) => option.value === scheduleContext.groupId)} onClick={() => setEditor((previous) => previous && !previous.groups.includes(scheduleContext.groupId) ? { ...previous, groups: [...previous.groups, scheduleContext.groupId] } : previous)}>Добавить группу к назначению</button></div>}
            <SearchMultiSelect key={editor.account.id} label="Найти и добавить учебные группы" options={groupOptions} knownOptions={previousGroups.map((id) => { const group = getAcademicGroup(id); return { value: id, label: group ? `${group.name}${isGroupActive(group) ? "" : " · В архиве"}` : `Группа недоступна (${id})` }; })} value={editor.groups} onChange={(groups) => setEditor((previous) => previous ? { ...previous, groups } : previous)} disabled={busy || unavailable} />
            <AssignmentChanges key={editor.account.id} before={previousGroups} after={editor.groups} disabled={busy} />
          </div> : <p className={styles.note}>Выберите преподавателя, затем найдите его учебные группы.</p>}
          <RecordEditorActions label={editor && !editor.groups.length && previousGroups.length ? "Снять назначение" : "Сохранить назначения"} disabled={busy || !editor || choosingTeacher || !dirty || unavailable || assignmentStale} busy={busy} onCancel={choosingTeacher && editor ? () => setChoosingTeacher(false) : closeEditor} hint={!editor || choosingTeacher ? "Выберите преподавателя, чтобы перейти к его группам." : editor && !editor.groups.length && previousGroups.length ? "Будет снято назначение на эту дисциплину. Потребуется подтверждение." : "Изменятся назначения только по этой дисциплине."} />
        </form>
      </RecordEditor>}
      <div className={styles.registry} hidden={formOpen}>
      {assignedTeachers.length > 0 && !teacherId && <div className={styles.listTools}>
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
      {assignedTeachers.length > 0 && !filteredTeachers.length && <div className={styles.empty}><strong>Назначения не найдены</strong><p>{teacherId ? "У выбранного преподавателя нет назначений по этой дисциплине." : "Попробуйте другую фамилию, логин или название группы."}</p>{query && <button type="button" onClick={() => setQuery("")}>Сбросить поиск</button>}</div>}
      {!assignedTeachers.length && !unavailable && <div className={styles.empty}>{teachers.length ? <>Преподаватели пока не назначены.<br />Выберите преподавателя и его группы.</> : <>Сначала создайте учётную запись преподавателя в разделе <Link to="/admin/accounts">«Учётные записи»</Link>.</>}</div>}
      </div>
    </section> : !subjectEditor && !catalogError && <div className={styles.empty}><strong>{subjectId ? "Дисциплина не найдена" : "Выберите дисциплину"}</strong><p>{subjectId ? "Найдите другую дисциплину через поиск или создайте новую." : "Найдите дисциплину по названию, чтобы назначить преподавателей и группы. Новую дисциплину можно создать кнопкой выше."}</p></div>}
    {confirm && editor && subject && <ConfirmDialog title="Изменить группы преподавателя?" confirmLabel={editor.groups.length ? "Сохранить назначения" : "Снять назначение"} cancelLabel="Вернуться к форме" confirmDisabled={unavailable || assignmentStale || choosingTeacher || !dirty} busy={busy} error={error || sourceError} onCancel={() => { setConfirm(false); setError(""); }} onConfirm={() => void save()}><p>{editor.account.name} · {subject.name}</p><AssignmentChanges before={previousGroups} after={editor.groups} expanded disabled={busy} /><p>После сохранения изменится доступ к выбранным группам только по этой дисциплине. Другие назначения сохранятся.</p>{assignmentStale && <p role="alert">Данные или права изменились. Вернитесь к форме и загрузите актуальные назначения перед применением. Текущий выбор пока сохранён.</p>}</ConfirmDialog>}
  </div>;
};
export default AdminSubjectsPage;
