import GroupComposition from "./GroupComposition";
import { getMoscowDateKey } from "../../domain/studentEducationEvent";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import Link from "../../components/ChecksContextLink";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import Dropdown from "../../components/Dropdown";
import SearchField from "../../components/SearchField";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import { groupCatalogService, readGroupCatalogState, type GroupStatusPreview } from "../../data/groupCatalogStore";
import { readAccountsState } from "../../data/accountStore";
import { getStudentGroupId, isAccountActive } from "../../domain/accounts";
import { matchesSearchText } from "../../domain/search";
import { CAMPUSES, getStudentNumberYear } from "../../domain/studentRecord";
import { isGroupActive, type GroupStatus } from "../../domain/groupCatalog";
import { STUDENT_ENROLLMENT_LABELS, isStudyingStudent } from "../../domain/studentEnrollment";
import { readManagedScheduleState, subscribeManagedSchedule } from "../../data/managedScheduleStore";
import Tabs from "../../components/Tabs";
import styles from "./index.module.scss";
import RecordEditor from "../../components/RecordEditor";
import { getGroupView, groupRegistrySearch, groupViewSearch, type GroupView } from "./presentation";
import GroupHistory from "./GroupHistory";
import GroupDetailsForm from "./GroupDetailsForm";
import GroupRefreshPanel from "./GroupRefreshPanel";
import AdministrationReturnNotice from "../../components/AdministrationReturnNotice";
import { applyGroupRefresh, groupDraftFrom, isGroupEditorStale, prepareGroupRefresh, type GroupEditor, type GroupEditorSource, type GroupRefreshReview } from "./groupEditorModel";

const PAGE_SIZE = 20;
const pageNumber = (value: string | null) => { const number = Number(value ?? 1); return Number.isSafeInteger(number) && number > 0 ? number : 1; };
const readEditorSource = (actorId: string): GroupEditorSource => {
  const state = readGroupCatalogState();
  const snapshot = readAccountsState();
  if (state.error || snapshot.error) throw new Error(state.error || snapshot.error);
  const actor = snapshot.accounts.find((entry) => entry.id === actorId);
  if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Обновите учётную запись активного настройщика.");
  return { ...state, accounts: snapshot.accounts, actorId };
};

export default function AdminGroupsPage() {
  const { currentUser, accounts, accountError, refreshAccounts } = useRole();
  const catalogue = useGroupCatalog();
  const { requestAction } = useUnsavedChangesGuard();
  const [params, setParams] = useSearchParams();
  const groupView = getGroupView(params);
  const historical = groupView === "dated";
  const selectedGroupId = params.get("group");
  const selected = catalogue.groups.find((group) => group.id === selectedGroupId);
  const queryKey = selected ? "studentQ" : "q";
  const pageKey = selected ? "studentPage" : "page";
  const query = params.get(queryKey) ?? "";
  const campus = params.get("campus") ?? "all";
  const statusFilter = params.get("status") ?? "active";
  const [editor, setEditor] = useState<GroupEditor | null>(null);
  const [refreshReview, setRefreshReview] = useState<GroupRefreshReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [statusReview, setStatusReview] = useState<(GroupStatusPreview & { status: GroupStatus }) | null>(null);
  const [scheduleState, setScheduleState] = useState(readManagedScheduleState);
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const creating = Boolean(editor);
  const dirty = Boolean(editor && JSON.stringify(editor.draft) !== editor.baseline);
  useUnsavedChangesWarning(dirty || busy);
  useEffect(() => subscribeManagedSchedule(() => setScheduleState(readManagedScheduleState())), []);
  useEffect(() => { setStatusReview(null); setRefreshReview(null); setError(""); setMessage(""); setEditor(null); }, [selectedGroupId]);
  useEffect(() => {
    if (creating) formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    else if (triggerRef.current) { (triggerRef.current.isConnected ? triggerRef.current : editButtonRef.current)?.focus(); triggerRef.current = null; }
  }, [creating]);
  useEffect(() => {
    if (!createdId || editor || busy) return;
    setParams((previous) => groupRegistrySearch(previous, createdId)); setCreatedId(null);
  }, [createdId, editor, busy, setParams]);

  const studentsByGroup = useMemo(() => {
    const result = new Map<string, typeof accounts>();
    for (const account of accounts) {
      const id = getStudentGroupId(account);
      if (id) { const students = result.get(id) ?? []; students.push(account); result.set(id, students); }
    }
    return result;
  }, [accounts]);
  const students = selected ? studentsByGroup.get(selected.id) ?? [] : [];
  const filteredStudents = students.filter((student) => matchesSearchText(`${student.name} ${student.login} ${student.email ?? ""} ${student.studentRecord?.number ?? ""}`, query));
  const filteredGroups = catalogue.groups.filter((group) => (statusFilter === "all" || (statusFilter === "archived" ? !isGroupActive(group) : isGroupActive(group))) && (campus === "all" || (campus === "unknown" ? group.campus === undefined : String(group.campus) === campus)) && matchesSearchText(`${group.name} ${(group.previousNames ?? []).join(" ")} ${group.admissionYear ?? ""}`, query));
  const count = selected ? filteredStudents.length : filteredGroups.length;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const page = Math.min(pageNumber(params.get(pageKey)), pages);
  const start = (page - 1) * PAGE_SIZE;
  const accountsState = readAccountsState();
  const sourceError = catalogue.error || accountError || accountsState.error;
  const blocked = busy || Boolean(sourceError);
  const currentManaged = catalogue.managed.find((group) => group.id === selected?.id);
  const actor = accountsState.accounts.find((account) => account.id === currentUser.id);
  const editorSource = { ...catalogue, accounts: accountsState.accounts, actorId: currentUser.id };
  const stale = Boolean(editor && isGroupEditorStale(editor, editorSource));
  const refreshReviewStale = Boolean(refreshReview && isGroupEditorStale(refreshReview, editorSource));
  const reviewStale = Boolean(statusReview && (statusReview.actorId !== currentUser.id || statusReview.expectedRevision !== catalogue.revision || statusReview.expectedAccountsRevision !== accountsState.revision || statusReview.expectedScheduleRevision !== scheduleState.snapshot.revision || statusReview.actorRevision !== actor?.revision));
  const history = catalogue.history.filter((entry) => entry.groupId === selected?.id).slice().reverse();
  const updateQuery = (value: string) => setParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set(queryKey, value); else next.delete(queryKey); next.delete(pageKey); return next; }, { replace: true });
  const setPage = (value: number) => setParams((previous) => { const next = new URLSearchParams(previous); if (value > 1) next.set(pageKey, String(value)); else next.delete(pageKey); return next; });
  const openCreation = () => requestAction(() => {
    try {
      const source = readEditorSource(currentUser.id);
      const actor = source.accounts.find((entry) => entry.id === source.actorId)!;
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const draft = { name: "", course: 1, campus: 0, admissionYear: getStudentNumberYear(new Date().toISOString()) };
      catalogue.refresh(); refreshAccounts();
      setEditor({ draft, baseline: JSON.stringify(draft), groupRevision: 0, revision: source.revision, actorId: actor.id, actorRevision: actor.revision }); setRefreshReview(null); setStatusReview(null); setError(""); setMessage("");
    } catch (failure) { console.error("Не удалось открыть создание группы:", failure); setError(failure instanceof Error ? failure.message : "Не удалось открыть форму группы."); }
  });
  const openEditing = () => requestAction(() => {
    if (!selected) return;
    try {
      const source = readEditorSource(currentUser.id);
      const group = source.groups.find((entry) => entry.id === selected.id);
      if (!group) throw new Error("Группа больше недоступна. Вернитесь к списку.");
      const actor = source.accounts.find((entry) => entry.id === source.actorId)!;
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const draft = groupDraftFrom(group, getStudentNumberYear(new Date().toISOString()));
      catalogue.refresh(); refreshAccounts();
      setEditor({ draft, baseline: JSON.stringify(draft), groupId: group.id, groupRevision: source.managed.find((entry) => entry.id === group.id)?.revision ?? 0, revision: source.revision, actorId: actor.id, actorRevision: actor.revision }); setRefreshReview(null); setStatusReview(null); setError(""); setMessage("");
    } catch (failure) { console.error("Не удалось открыть реквизиты группы:", failure); setError(failure instanceof Error ? failure.message : "Не удалось открыть реквизиты группы."); }
  });
  const close = () => requestAction(() => { setEditor(null); setRefreshReview(null); setError(""); });
  const create = async (event: FormEvent) => {
    event.preventDefault(); if (!editor || blocked || stale || refreshReview) return;
    setBusy(true); setError("");
    try {
      const command = { actorId: currentUser.id, actorRevision: editor.actorRevision, expectedRevision: editor.revision, draft: editor.draft };
      const group = editor.groupId ? await groupCatalogService.update({ ...command, groupId: editor.groupId, groupRevision: editor.groupRevision }) : await groupCatalogService.create(command);
      setEditor(null); if (!editor.groupId) setCreatedId(group.id); setMessage(editor.groupId ? `Реквизиты группы «${group.name}» сохранены.` : `Группа «${group.name}» создана. Добавьте её студентов и назначьте дисциплины.`);
    } catch (failure) { console.error("Не удалось сохранить группу из формы:", failure); setError(failure instanceof Error ? failure.message : "Не удалось сохранить группу. Повторите попытку."); }
    finally { setBusy(false); }
  };
  const refreshRevision = () => {
    if (!editor || busy) return;
    try {
      const result = prepareGroupRefresh(editor, readEditorSource(currentUser.id));
      catalogue.refresh(); refreshAccounts();
      if (result.editor) setEditor(result.editor);
      setRefreshReview(result.review); setError("");
      if (result.editor) requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>("input")?.focus());
    } catch (failure) { console.error("Не удалось обновить проверку реквизитов группы:", failure); setError(failure instanceof Error ? failure.message : "Не удалось обновить проверку. Введённые реквизиты сохранены."); }
  };
  const chooseRefresh = (choice: "draft" | "saved") => {
    if (!editor || !refreshReview || busy || blocked || refreshReviewStale) return;
    const apply = () => {
      try {
        const nextEditor = applyGroupRefresh(editor, refreshReview, readEditorSource(currentUser.id), choice, getStudentNumberYear(new Date().toISOString()));
        catalogue.refresh(); refreshAccounts();
        setEditor(nextEditor); setRefreshReview(null); setError("");
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>("input")?.focus());
      } catch (failure) { console.error("Не удалось применить выбор реквизитов группы:", failure); setError(failure instanceof Error ? failure.message : "Не удалось применить выбор. Обновите сравнение."); }
    };
    if (choice === "saved" && dirty) requestAction(apply); else apply();
  };
  const reviewStatus = async () => {
    if (!selected || !actor || blocked) return;
    setBusy(true); setError(""); setMessage("");
    try { const review = await groupCatalogService.previewStatus({ actorId: currentUser.id, actorRevision: actor.revision, expectedRevision: catalogue.revision, groupId: selected.id, groupRevision: currentManaged?.revision ?? 0 }); setStatusReview({ ...review, status: isGroupActive(selected) ? "archived" : "active" }); }
    catch (failure) { console.error("Не удалось подготовить изменение состояния группы:", failure); setError(failure instanceof Error ? failure.message : "Не удалось проверить зависимости группы."); }
    finally { setBusy(false); }
  };
  const applyStatus = async () => {
    if (!statusReview || blocked || reviewStale) return;
    setBusy(true); setError("");
    try { const group = await groupCatalogService.changeStatus(statusReview); setStatusReview(null); setMessage(`Группа «${group.name}» ${isGroupActive(group) ? "восстановлена" : "перенесена в архив"}.`); }
    catch (failure) { console.error("Не удалось применить состояние группы:", failure); setError(failure instanceof Error ? failure.message : "Не удалось изменить состояние группы."); }
    finally { setBusy(false); }
  };

  return <div className={`pageContainer ${styles.page}`}>
    <AdministrationReturnNotice />
    <div hidden={Boolean(editor)} className={styles.topline}>{selected ? <Link to={`/admin/groups?${groupRegistrySearch(params)}`}>← Все группы</Link> : <Link to="/admin/students">Список студентов →</Link>}<button type="button" className={styles.primary} disabled={blocked} onClick={openCreation}>Создать группу</button></div>
    {sourceError && <div className={styles.error} role="alert"><p>{sourceError}</p><button type="button" disabled={busy} onClick={() => { catalogue.refresh(); refreshAccounts(); }}>Повторить чтение</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {editor ? <RecordEditor title={editor.groupId ? selected?.name ?? editor.draft.name : "Новая группа"} context={editor.groupId ? "Реквизиты учебной группы" : "Создание в каталоге учебных групп"} dirty={dirty} busy={busy} closeLabel={editor.groupId ? "К группе" : "К списку"} onClose={close}>
      {refreshReview ? <GroupRefreshPanel draft={editor.draft} review={refreshReview} stale={refreshReviewStale} disabled={blocked} onRefresh={refreshRevision} onChoose={chooseRefresh} /> : stale && <div className={styles.sourceNotice} role="alert"><p>Справочник или права изменились. Введённые реквизиты сохранены. Обновите проверку; если изменилась сама группа, сначала появится сравнение.</p><button type="button" disabled={busy} onClick={refreshRevision}>Обновить проверку</button></div>}
      {!refreshReview && <GroupDetailsForm key={`${editor.groupId ?? "new"}:${editor.revision}:${editor.actorId}:${editor.actorRevision}`} draft={editor.draft} editing={Boolean(editor.groupId)} dirty={dirty} disabled={blocked} stale={stale} busy={busy} formRef={formRef} onChange={(draft) => setEditor((previous) => previous ? { ...previous, draft } : previous)} onSubmit={(event) => void create(event)} onCancel={close} />}
    </RecordEditor> : params.has("group") && !selected ? <div className={styles.empty}><strong>Группа недоступна</strong><p>Проверьте ссылку или найдите группу в общем списке.</p><Link to="/admin/groups">Вернуться к группам</Link></div> : <>
      {selected && <section className={styles.summary} aria-label="Сведения о группе"><div><h2>{selected.name}</h2><p>{selected.course} курс{selected.admissionYear ? ` · Набор ${selected.admissionYear}` : ""}{selected.campus ? ` · Корпус ${selected.campus}` : ""} · {isGroupActive(selected) ? "Действующая" : "В архиве"}</p><span>Сейчас учатся: {students.filter(isStudyingStudent).length} · Всего записей студентов: {students.length}</span></div><div className={styles.actions}>{isGroupActive(selected) && <><Link className={styles.primary} to={`/admin/accounts?type=student&group=${encodeURIComponent(selected.id)}&create=student`}>Добавить студента</Link></>}<button ref={editButtonRef} type="button" disabled={blocked} onClick={openEditing}>Редактировать</button><details className={styles.moreActions}><summary>Ещё действия</summary><div className={styles.extraActions}>{isGroupActive(selected) && <Link to={`/admin/accounts/import?group=${encodeURIComponent(selected.id)}&from=group`}>Загрузить список</Link>}<Link to={`/admin/schedule?group=${encodeURIComponent(selected.id)}`}>Расписание группы</Link><button type="button" disabled={blocked || !currentManaged} onClick={() => void reviewStatus()}>{isGroupActive(selected) ? "В архив" : "Восстановить группу"}</button></div></details></div>{!currentManaged && <p className={styles.note}>В исходной группе не все реквизиты заполнены. Для управления архивом сначала укажите корпус и год набора в редакторе.</p>}</section>}
      {statusReview && selected && <section className={styles.review} aria-label="Проверка состояния группы"><div className={styles.heading}><h3>{statusReview.status === "archived" ? "Перед архивированием" : "Перед восстановлением"}</h3><button type="button" disabled={busy} onClick={() => setStatusReview(null)}>Закрыть проверку</button></div><p className={styles.note}>Учатся: {statusReview.dependencies.students} · Назначения преподавателей: {statusReview.dependencies.teachingAssignments} · Пары в черновиках: {statusReview.dependencies.draftLessons} · Будущие пары: {statusReview.dependencies.futurePublishedLessons}</p><p className={styles.note}>{statusReview.status === "archived" ? `Прошлые опубликованные пары (${statusReview.dependencies.pastPublishedLessons}), выпускники, отчисленные и история сохранятся. Группа исчезнет из выбора для новых учёток, назначений и расписания.` : "Группа снова станет доступна для новых учёток, назначений и расписания. Прежние назначения не восстанавливаются автоматически."}</p>{statusReview.status === "archived" && statusReview.blockers.length > 0 && <ul className={styles.blockers}>{statusReview.blockers.map((reason) => <li key={reason}>{reason}</li>)}</ul>}{reviewStale && <p className={styles.error} role="alert">Зависимости группы изменились. Обновите проверку перед применением.</p>}<div className={styles.actions}><button type="button" className={styles.primary} disabled={blocked || reviewStale || (statusReview.status === "archived" && statusReview.blockers.length > 0)} onClick={() => void applyStatus()}>{statusReview.status === "archived" ? "Архивировать группу" : "Подтвердить восстановление"}</button><button type="button" disabled={blocked} onClick={() => void reviewStatus()}>Обновить проверку</button>{statusReview.dependencies.students > 0 && <Link to={`/admin/students?group=${encodeURIComponent(selected.id)}&enrollment=studying`}>Открыть студентов</Link>}{statusReview.dependencies.teachingAssignments > 0 && <Link to="/admin/subjects">Открыть дисциплины</Link>}</div></section>}
      {selected && <Tabs variant="filter" ariaLabel="Разделы учебной группы" value={groupView} items={[{ value: "current", label: "Текущий состав" }, { value: "dated", label: "На дату" }, { value: "history", label: "История", count: catalogue.error || accountError ? undefined : history.length }]} onChange={(value) => setParams((previous) => groupViewSearch(previous, value as GroupView, getMoscowDateKey()))} />}
      {selected && groupView === "history" ? <GroupHistory key={selected.id} entries={history} accounts={accounts} unavailable={Boolean(catalogue.error || accountError)} requestedPage={params.get("historyPage")} onPage={(value) => setParams((previous) => { const next = new URLSearchParams(previous); if (value > 1) next.set("historyPage", String(value)); else next.delete("historyPage"); return next; })} /> : selected && historical ? <GroupComposition key={selected.id} groupId={selected.id} groupName={selected.name} /> : <>
      {!selected && <Tabs variant="filter" ariaLabel="Состояние групп" value={statusFilter} items={[{ value: "active", label: "Действующие", count: catalogue.groups.filter(isGroupActive).length }, { value: "archived", label: "Архив", count: catalogue.groups.filter((group) => !isGroupActive(group)).length }, { value: "all", label: "Все", count: catalogue.groups.length }]} onChange={(value) => setParams((previous) => { const next = new URLSearchParams(previous); next.set("status", value); next.delete("page"); return next; })} />}
      <div className={styles.toolbar}>
        <SearchField label={selected ? "Поиск студента в группе" : "Поиск группы"} placeholder="" value={query} onChange={updateQuery} />
        {!selected && <Dropdown label="Корпус в списке групп" value={campus} options={[{ value: "all", label: "Все корпуса" }, ...CAMPUSES, { value: "unknown", label: "Не указан" }]} onChange={(value) => setParams((previous) => { const next = new URLSearchParams(previous); if (value === "all") next.delete("campus"); else next.set("campus", value); next.delete("page"); return next; }, { replace: true })} />}
      </div>
      <div className={styles.resultLine}><p role="status">{selected ? "Студенты" : "Группы"}: {count}{count > 0 && ` · ${start + 1}–${Math.min(start + PAGE_SIZE, count)}`}</p>{pages > 1 && <nav className={styles.pagination} aria-label={selected ? "Страницы состава группы" : "Страницы групп"}><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</button><span>{page} / {pages}</span><button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>Далее</button></nav>}</div>
      <div className={selected ? styles.students : styles.groups}>
        {selected ? filteredStudents.slice(start, start + PAGE_SIZE).map((student) => <article key={student.id} className={styles.student}><div><strong>{student.name}</strong><span>{student.login}</span><span>{student.studentRecord ? `Зачетка ${student.studentRecord.number}` : "Номер зачетки не выдан"}</span><span>{STUDENT_ENROLLMENT_LABELS[student.enrollmentStatus ?? "studying"]}</span></div><span className={!isAccountActive(student) ? styles.blocked : styles.note}>{isAccountActive(student) ? "Доступ открыт" : "Доступ заблокирован"}</span><Link to={`/admin/accounts?type=student&group=${encodeURIComponent(selected.id)}&account=${encodeURIComponent(student.id)}`} aria-label={`Открыть учётную запись: ${student.name}`}>Открыть учётку</Link></article>) : filteredGroups.slice(start, start + PAGE_SIZE).map((group) => <Link className={styles.group} to={`/admin/groups?${groupRegistrySearch(params, group.id)}`} key={group.id}><div><strong>{group.name}</strong><span>{group.course} курс{group.admissionYear ? ` · Набор ${group.admissionYear}` : ""} · {isGroupActive(group) ? "Действующая" : "В архиве"}</span></div><div><span>{group.campus ? `Корпус ${group.campus}` : "Корпус не указан"}</span><span>Студентов в системе: {studentsByGroup.get(group.id)?.length ?? 0}</span></div><span className={styles.open}>Состав группы →</span></Link>)}
      </div>
      {!count && !catalogue.error && !accountError && <div className={styles.empty}><strong>{query ? "Ничего не найдено" : selected ? "В группе пока нет студентов" : "Группы не найдены"}</strong><p>{query ? "Измените запрос или сбросьте поиск." : selected ? "Добавьте студента — он появится в составе сразу после создания учётной записи." : "Выберите другой корпус или создайте группу."}</p>{query && <button type="button" onClick={() => updateQuery("")}>Сбросить поиск</button>}</div>}
      </>}
    </>}
  </div>;
}
