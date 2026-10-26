import EducationEventFields, { EducationEventSummary, emptyEducationDetails } from "../../components/EducationEventFields";
import type { EducationEventDetails } from "../../domain/studentEducationEvent";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ACCOUNT_ROLE_LABELS, getStudentGroupId, isAccountActive, isUserRole, type AccountDraft, type PortalAccount, type UserRole, type AccountChange } from "../../domain/accounts";
import { CAMPUSES } from "../../domain/studentRecord";
import { matchesSearchText } from "../../domain/search";
import { accountService, readAccountsState } from "../../data/accountStore";
import { ACADEMIC_GROUPS, getAcademicGroup } from "../../data/academicCatalog";
import { changesAdminAccount } from "../../domain/unsavedNavigation";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useSubjectCatalog } from "../../hooks/useSubjectCatalog";
import { useStudentNumberPreview } from "../../hooks/useStudentNumberPreview";
import SearchField from "../../components/SearchField";
import Dropdown from "../../components/Dropdown";
import ConfirmDialog from "../../components/ConfirmDialog";
import Tabs from "../../components/Tabs";
import PasswordResetDialog from "./PasswordResetDialog";
import styles from "./index.module.scss";
import { isGroupActive } from "../../domain/groupCatalog";
import { STUDENT_ENROLLMENT_LABELS, isStudentEnrollmentStatus, type StudentEnrollmentStatus } from "../../domain/studentEnrollment";

const roleOptions = (Object.keys(ACCOUNT_ROLE_LABELS) as UserRole[]).map((value) => ({ value, label: ACCOUNT_ROLE_LABELS[value] }));
const modes = [{ value: "details", label: "Данные" }, { value: "role", label: "Тип" }, { value: "access", label: "Доступ" }, { value: "history", label: "История" }];
type Mode = "create" | "details" | "role" | "access" | "history";
type Editor = { account?: PortalAccount; draft: AccountDraft; revision: number; actorRevision: number; mode: Mode; education: EducationEventDetails };
type Confirmation = "save" | "block" | "activate" | "issue" | null;
const accountIntent = (params: URLSearchParams) => JSON.stringify([params.get("account"), params.get("create"), params.get("mode")]);
const auditLabels: Record<AccountChange["action"], string> = { created: "Учётная запись создана", "role-changed": "Изменён тип", "assignments-changed": "Изменены назначения", "details-changed": "Обновлены данные", "status-changed": "Изменён доступ", "student-number-issued": "Выдан номер зачетки" };
const fieldLabels: Record<string, string> = { name: "Имя", login: "Логин", email: "Почта", group: "Группа", status: "Статус", studentNumber: "Номер зачетки", admissionDate: "Дата зачисления", enrollmentStatus: "Состояние обучения" };
const displayValue = (field: string, value: string) => field === "enrollmentStatus" && isStudentEnrollmentStatus(value) ? STUDENT_ENROLLMENT_LABELS[value] : field === "status" ? value === "blocked" ? "Заблокирована" : "Активна" : field === "group" ? value.split(", ").map((id) => getAcademicGroup(id)?.name ?? id).join(", ") : value || "Не указано";
const detailsEqual = (draft: AccountDraft, account: PortalAccount) => draft.name === account.name && draft.login === account.login && (draft.email ?? "") === (account.email ?? "") && (draft.enrollmentStatus ?? "studying") === (account.enrollmentStatus ?? "studying") && getStudentGroupId(draft) === getStudentGroupId(account) && JSON.stringify(draft.memberships) === JSON.stringify(account.memberships);
const makeAccountEditor = (actorId: string, target?: PortalAccount, mode: Mode = "details", groupId?: string): Editor => {
  const snapshot = readAccountsState();
  const actor = snapshot.accounts.find((entry) => entry.id === actorId);
  if (snapshot.error || !actor) throw new Error(snapshot.error || "Обновите учётные записи.");
  const group = getAcademicGroup(groupId);
  return { education: emptyEducationDetails(), account: target, revision: snapshot.revision, actorRevision: actor.revision, mode: target ? mode : "create", draft: target ? { name: target.name, login: target.login, email: target.email, role: target.role, scheduleName: target.scheduleName, studentGroupId: target.studentGroupId, enrollmentStatus: target.enrollmentStatus, memberships: target.memberships.map((entry) => ({ ...entry, groupIds: [...entry.groupIds] })) } : { name: "", login: "", email: "", role: "student", memberships: [], studentGroupId: group?.id, studentCampus: group?.campus } };
};

const AdminAccountsPage = () => {
  const { accounts, currentUser, role, accountError } = useRole();
  const { error: catalogError } = useSubjectCatalog();
  const { requestAction } = useUnsavedChangesGuard();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const type = isUserRole(params.get("type")) ? params.get("type")! : "all";
  const status = ["active", "blocked"].includes(params.get("status") ?? "") ? params.get("status")! : "all";
  const groupFilter = params.get("group") ?? "all";
  const rawPage = Number(params.get("page") ?? "1");
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savedAccountId, setSavedAccountId] = useState<string | null>(null);
  const intentRef = useRef<string | null>(null);
  const account = editor?.account;
  const educationDirty = Boolean(editor?.mode === "details" && account?.role === "student" && (getStudentGroupId(editor.draft) !== getStudentGroupId(account) || (editor.draft.enrollmentStatus ?? "studying") !== (account.enrollmentStatus ?? "studying")));
  const detailsDirty = Boolean(editor && account && !detailsEqual(editor.draft, account));
  const dirty = Boolean(editor && (editor.mode === "create" ? editor.draft.name || editor.draft.login || editor.draft.email || editor.draft.studentCampus || editor.draft.studentGroupId || editor.draft.memberships.length : editor.mode === "role" ? editor.draft.role !== account?.role : editor.mode === "details" && (detailsDirty || editor.draft.studentCampus)));
  useUnsavedChangesWarning(dirty || busy, changesAdminAccount);
  const needsNumber = Boolean(editor && editor.draft.role === "student" && !account?.studentRecord && ["create", "role", "details"].includes(editor.mode));
  const number = useStudentNumberPreview(needsNumber, editor?.draft.studentCampus ?? 0, currentUser.id, editor?.actorRevision ?? 0);
  const preview = needsNumber && number.preview?.campus === editor?.draft.studentCampus ? number.preview : null;
  useEffect(() => { if (preview) setEditor((previous) => previous ? { ...previous, revision: preview.revision } : previous); }, [preview]);
  useLayoutEffect(() => {
    const key = accountIntent(params);
    if (intentRef.current === key) return;
    intentRef.current = key;
    setConfirmation(null); setError("");
    try {
      const id = params.get("account");
      const target = id ? accounts.find((entry) => entry.id === id) : undefined;
      if (id && !target) throw new Error("Учётная запись не найдена. Выберите её в списке.");
      const mode = modes.some((entry) => entry.value === params.get("mode")) ? params.get("mode") as Mode : "details";
      setEditor(target ? makeAccountEditor(currentUser.id, target, mode) : params.get("create") === "student" ? makeAccountEditor(currentUser.id, undefined, "create", params.get("group") ?? undefined) : null);
    } catch (failure) { console.error("Не удалось открыть учётную запись по ссылке:", failure); setEditor(null); setError(failure instanceof Error ? failure.message : "Не удалось открыть учётную запись."); }
  }, [params, accounts, currentUser.id]);
  useEffect(() => {
    if (!savedAccountId || busy) return;
    setParams((previous) => { const next = new URLSearchParams(previous); next.set("account", savedAccountId); next.delete("create"); next.delete("mode"); return next; }, { replace: true });
    setSavedAccountId(null);
  }, [savedAccountId, busy, setParams]);
  const visible = useMemo(() => accounts.filter((entry) => (type === "all" || entry.role === type) && (status === "all" || (entry.status ?? "active") === status) && (groupFilter === "all" || getStudentGroupId(entry) === groupFilter) && matchesSearchText(`${entry.name} ${entry.login} ${entry.email ?? ""} ${entry.studentRecord?.number ?? ""}`, query)), [accounts, type, status, groupFilter, query]);
  const pageCount = Math.max(1, Math.ceil(visible.length / 20));
  const currentPage = Math.min(page, pageCount);
  const shown = visible.slice((currentPage - 1) * 20, currentPage * 20);
  const blocked = Boolean(accountError || catalogError) || busy;
  const historyState = readAccountsState();
  const history = historyState.history.filter((entry) => entry.accountId === account?.id).slice().reverse();
  const stale = Boolean(editor && account && accounts.find((entry) => entry.id === account.id)?.revision !== account.revision);
  if (role !== "configurator") return <div className={styles.empty}>Управление учётными записями доступно настройщику.</div>;

  const open = (target?: PortalAccount, mode: Mode = "details") => requestAction(() => {
    try {
      const nextEditor = makeAccountEditor(currentUser.id, target, mode);
      setEditor(nextEditor); setError(""); setMessage(""); setConfirmation(null);
      setParams((previous) => { const next = new URLSearchParams(previous); if (target) { next.set("account", target.id); next.set("mode", mode); next.delete("create"); } else { next.set("create", "student"); next.delete("account"); next.delete("mode"); } intentRef.current = accountIntent(next); return next; });
    }
    catch (failure) { console.error("Не удалось открыть учётную запись:", failure); setError(failure instanceof Error ? failure.message : "Не удалось открыть учётную запись."); }
  });
  const close = () => requestAction(() => { setEditor(null); setError(""); setConfirmation(null); setParams((previous) => { const next = new URLSearchParams(previous); next.delete("account"); next.delete("create"); next.delete("mode"); intentRef.current = accountIntent(next); return next; }); });
  const changeMode = (mode: string) => { if (mode !== editor?.mode && account) open(accounts.find((entry) => entry.id === account.id), mode as Mode); };
  const updateDraft = (patch: Partial<AccountDraft>) => setEditor((previous) => previous ? { ...previous, draft: { ...previous.draft, ...patch } } : previous);
  const finish = (updated: PortalAccount, text: string) => { setConfirmation(null); setEditor(makeAccountEditor(currentUser.id, updated, editor?.mode === "create" ? "details" : editor?.mode)); setMessage(text); if (editor?.mode === "create") setSavedAccountId(updated.id); };
  const save = async () => {
    if (!editor || busy || (needsNumber && !preview && editor.mode !== "details")) return;
    setBusy(true); setError("");
    try {
      const context = { actorId: currentUser.id, actorRevision: editor.actorRevision, expectedRevision: editor.revision };
      const target = account ? { ...context, accountId: account.id, accountRevision: account.revision } : null;
      let updated: PortalAccount;
      if (!account) updated = await accountService.create({ ...context, draft: editor.draft, expectedStudentNumber: preview?.number });
      else if (editor.mode === "role") updated = await accountService.changeRole({ ...target!, role: editor.draft.role, memberships: editor.draft.memberships, studentGroupId: editor.draft.studentGroupId, studentCampus: editor.draft.studentCampus, expectedStudentNumber: preview?.number });
      else updated = await accountService.updateDetails({ ...target!, ...(educationDirty ? { education: editor.education } : {}), details: { name: editor.draft.name, login: editor.draft.login, email: editor.draft.email, ...(account.role === "student" ? { memberships: editor.draft.memberships, studentGroupId: editor.draft.studentGroupId, enrollmentStatus: editor.draft.enrollmentStatus } : {}) } });
      finish(updated, !account ? "Учётная запись создана." : "Изменения сохранены. ID и учебная история сохранены.");
    } catch (failure) { console.error("Не удалось сохранить учётную запись:", failure); setConfirmation(null); setError(failure instanceof Error ? failure.message : "Не удалось сохранить учётную запись."); if (needsNumber) number.refresh(); }
    finally { setBusy(false); }
  };
  const executeAccess = async () => {
    if (!editor || !account || busy) return;
    setBusy(true); setError("");
    try {
      const target = { actorId: currentUser.id, actorRevision: editor.actorRevision, expectedRevision: editor.revision, accountId: account.id, accountRevision: account.revision };
      const updated = confirmation === "issue" ? await accountService.issueStudentRecord({ ...target, campus: editor.draft.studentCampus!, expectedStudentNumber: preview!.number }) : await accountService.changeStatus({ ...target, status: confirmation === "block" ? "blocked" : "active" });
      finish(updated, confirmation === "issue" ? `Номер зачетки выдан: ${updated.studentRecord!.number}.` : `Учётная запись ${isAccountActive(updated) ? "активирована" : "заблокирована"}.`);
    } catch (failure) { console.error("Не удалось выполнить действие с учётной записью:", failure); setError(failure instanceof Error ? failure.message : "Не удалось выполнить действие."); if (confirmation === "issue") { setConfirmation(null); number.refresh(); } }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (account && (editor?.mode === "role" || educationDirty || getStudentGroupId(account) !== getStudentGroupId(editor!.draft))) setConfirmation("save"); else void save(); };
  const filter = (key: string, value: string) => setParams((previous) => { const next = new URLSearchParams(previous); if (value && value !== "all") next.set(key, value); else next.delete(key); next.delete("page"); return next; }, { replace: true });
  const setPage = (value: number) => setParams((previous) => { const next = new URLSearchParams(previous); if (value > 1) next.set("page", String(value)); else next.delete("page"); return next; });
  const studentNumber = needsNumber ? <div className={styles.numberSection}>
    <Dropdown label="Учебный корпус" value={String(editor?.draft.studentCampus ?? "")} options={CAMPUSES} onChange={(value) => updateDraft({ studentCampus: Number(value) })} disabled={blocked} />
    <label>Номер зачетки<input readOnly aria-describedby="student-number-hint" value={preview?.number ?? ""} /></label>
    <p id="student-number-hint" className={styles.note}>{number.loading ? "Получаем номер…" : preview ? `${preview.year} год · корпус ${preview.campus} · ${String(preview.sequence).padStart(4, "0")}. Номер присвоится при ${account && editor?.mode === "details" ? "выдаче" : "сохранении"}.` : "Выберите корпус, чтобы увидеть номер до сохранения."}</p>
    {number.error && <p role="alert" className={styles.error}>{number.error} <button type="button" onClick={number.refresh}>Повторить</button></p>}
    {account && editor?.mode === "details" && <button type="button" disabled={blocked || !preview || detailsDirty} onClick={() => setConfirmation("issue")}>Выдать номер зачетки</button>}
    {account && detailsDirty && <p className={styles.note}>Сначала сохраните изменения данных, затем выдайте номер.</p>}
  </div> : account?.studentRecord && <div className={styles.numberSection}><label>Номер зачетки<input readOnly value={account.studentRecord.number} /></label><p className={styles.note}>{account.studentRecord.year} год · корпус {account.studentRecord.campus}. Выданный номер сохраняется при смене группы и типа учётки.</p></div>;
  return <div className={`pageContainer ${styles.page}`}>
    <div className={styles.toolbar}>
      <SearchField label="Поиск учётных записей" value={query} onChange={(value) => filter("q", value)} placeholder="" />
      <Dropdown label="Тип учётной записи в списке" value={type} options={[{ value: "all", label: "Все типы" }, ...roleOptions]} onChange={(value) => filter("type", value)} />
      <Dropdown label="Статус в списке" value={status} options={[{ value: "all", label: "Все статусы" }, { value: "active", label: "Активные" }, { value: "blocked", label: "Заблокированные" }]} onChange={(value) => filter("status", value)} />
      <Dropdown searchable label="Группа в списке студентов" value={groupFilter} options={[{ value: "all", label: "Все группы" }, ...ACADEMIC_GROUPS.map((group) => ({ value: group.id, label: group.name }))]} onChange={(value) => filter("group", value)} />
      <div className={styles.toolbarActions}><button type="button" className={styles.primary} disabled={blocked} onClick={() => open()}>Создать учётную запись</button><Link className={styles.importLink} to={`/admin/accounts/import${groupFilter !== "all" ? `?group=${encodeURIComponent(groupFilter)}` : ""}`}>Импорт студентов</Link></div>
    </div>
    <p className={styles.note}>Демо-режим: вход выбирается в меню кабинета. Управление паролями станет доступно после подключения сервера авторизации.</p>
    {(accountError || catalogError) && <p role="alert" className={styles.error}>{accountError || catalogError}</p>}
    {message && <p role="status" className={styles.message}>{message}</p>}
    {error && !confirmation && <p role="alert" className={styles.error}>{error}</p>}
    {editor && <section className={styles.editor} aria-label={account ? `Управление: ${account.name}` : "Новая учётная запись"}>
      <header className={styles.editorHeader}><div><h2>{account?.name ?? "Новая учётная запись"}</h2>{account && <p className={styles.note}>{ACCOUNT_ROLE_LABELS[account.role]} · {isAccountActive(account) ? "Активна" : "Заблокирована"}</p>}</div><button type="button" disabled={busy} onClick={close}>Закрыть</button></header>
      {account && <Tabs className={styles.accountTabs} ariaLabel="Управление учётной записью" items={modes} value={editor.mode} onChange={changeMode} />}
      {stale && <p role="alert" className={styles.error}>Учётная запись обновлена в другой вкладке. Введённые данные сохранены в форме. <button type="button" onClick={() => open(accounts.find((entry) => entry.id === account?.id), editor.mode)}>Обновить карточку</button></p>}
      {["create", "details", "role"].includes(editor.mode) && <form aria-label={editor.mode === "create" ? "Новая учётная запись" : editor.mode === "role" ? "Изменение типа учётной записи" : "Данные учётной записи"} onSubmit={submit}>
        <fieldset disabled={blocked} className={styles.fields}>
          <label>Имя и фамилия<input required minLength={2} maxLength={120} value={editor.draft.name} readOnly={editor.mode === "role"} onChange={(event) => updateDraft({ name: event.target.value })} autoComplete="off" /></label>
          <label>Логин<input required minLength={3} maxLength={64} value={editor.draft.login} readOnly={editor.mode === "role"} onChange={(event) => updateDraft({ login: event.target.value })} autoComplete="off" autoCapitalize="none" spellCheck={false} /></label>
          {editor.mode !== "role" && <label>Электронная почта<input type="email" maxLength={254} value={editor.draft.email ?? ""} onChange={(event) => updateDraft({ email: event.target.value })} autoComplete="off" /></label>}
          {editor.mode !== "details" && <Dropdown label="Тип учётной записи" value={editor.draft.role} options={roleOptions} onChange={(value) => updateDraft({ role: value as UserRole, memberships: account?.role === value ? account.memberships : [], studentGroupId: account?.role === value ? account.studentGroupId : undefined, studentCampus: undefined })} disabled={blocked} />}
          {editor.draft.role === "student" && <Dropdown searchable label="Учебная группа студента" value={getStudentGroupId(editor.draft) ?? ""} options={ACADEMIC_GROUPS.filter((group) => isGroupActive(group) || group.id === getStudentGroupId(editor.draft)).map((group) => ({ value: group.id, label: `${group.name}${isGroupActive(group) ? "" : " · В архиве"}` }))} onChange={(id) => updateDraft({ studentGroupId: id, memberships: [] })} disabled={blocked} />}
          {account?.role === "student" && editor.mode === "details" && <Dropdown label="Состояние обучения" value={editor.draft.enrollmentStatus ?? "studying"} options={(Object.keys(STUDENT_ENROLLMENT_LABELS) as StudentEnrollmentStatus[]).map((value) => ({ value, label: STUDENT_ENROLLMENT_LABELS[value] }))} onChange={(value) => updateDraft({ enrollmentStatus: value as StudentEnrollmentStatus })} disabled={blocked} />}
        </fieldset>
        {educationDirty && <EducationEventFields value={editor.education} onChange={(education) => setEditor((previous) => previous ? { ...previous, education } : previous)} disabled={blocked} />}
        {studentNumber}
        {account?.role === "student" && editor.mode === "details" && <p className={styles.note}>Состояние обучения учитывается при архивировании группы. Доступ к кабинету меняется отдельно во вкладке «Доступ».</p>}
        {editor.draft.role === "teacher" && <p className={styles.assignmentNote}>Предметы и группы преподавателя назначаются в разделе <Link to="/admin/subjects">«Дисциплины»</Link>.</p>}
        <div className={styles.formActions}><button className={styles.primary} type="submit" disabled={blocked || stale || (educationDirty && editor.education.basis.trim().length < 3) || (editor.mode !== "details" && needsNumber && !preview) || (editor.mode === "details" && !detailsDirty) || (editor.mode === "role" && editor.draft.role === account?.role)}>{busy ? "Сохраняем…" : editor.mode === "create" ? "Создать" : editor.mode === "role" ? "Изменить тип" : "Сохранить данные"}</button><span>{editor.mode === "create" ? "Номер зачетки генерируется системой и не редактируется." : "ID, переписка, файлы и учебная история сохраняются."}</span></div>
      </form>}
      {account && editor.mode === "access" && <div className={styles.accessGrid}>
        <article className={styles.accessCard}><h3>Доступ к кабинету</h3><p>{isAccountActive(account) ? "Учётная запись активна." : "Вход в кабинет заблокирован. Данные сохранены."}</p><button type="button" disabled={blocked || account.id === currentUser.id} onClick={() => setConfirmation(isAccountActive(account) ? "block" : "activate")}>{isAccountActive(account) ? "Заблокировать" : "Восстановить доступ"}</button>{account.id === currentUser.id && <p className={styles.note}>Свою текущую учётку заблокировать нельзя.</p>}</article>
        <article className={styles.accessCard}><h3>Пароль</h3><p>Сброс по одноразовой ссылке на электронную почту.</p><button type="button" disabled={busy} onClick={() => setResetOpen(true)}>Сбросить пароль</button><p className={styles.note}>Интерфейс подготовлен. Сервер авторизации не подключён.</p></article>
      </div>}
      {account?.role === "student" && <Link className={styles.importLink} to={`/admin/students/${encodeURIComponent(account.id)}/education`}>История обучения · даты и основания</Link>}
      {account && editor.mode === "history" && <div><p className={styles.note}>Создана: {account.createdAt ? new Date(account.createdAt).toLocaleString("ru-RU") : "до добавления учёта даты"} · Версия {account.revision}</p><ol className={styles.history}>{history.slice(0, 50).map((entry) => <li key={entry.id}><div><strong>{auditLabels[entry.action]}</strong><time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString("ru-RU")}</time></div><p>{accounts.find((actor) => actor.id === entry.actorId)?.name ?? entry.actorId}{entry.action === "role-changed" ? ` · ${entry.previousRole ? ACCOUNT_ROLE_LABELS[entry.previousRole] : ""} → ${ACCOUNT_ROLE_LABELS[entry.nextRole]}` : ""}</p>{entry.importBatchId && <p><Link to={`/admin/accounts/import?batch=${encodeURIComponent(entry.importBatchId)}`}>Открыть пакет импорта</Link></p>}{entry.studentOperationBatchId && <p><Link to={`/admin/students?batch=${encodeURIComponent(entry.studentOperationBatchId)}`}>Открыть массовое действие</Link></p>}{entry.educationEventId && <p><Link to={`/admin/students/${encodeURIComponent(account.id)}/education#${entry.educationEventId}`}>Открыть событие обучения</Link></p>}{entry.changes?.map((change, index) => <p key={index}>{fieldLabels[change.field] ?? change.field}: {displayValue(change.field, change.before)} → {displayValue(change.field, change.after)}</p>)}</li>)}</ol>{!history.length && <p className={styles.empty}>Изменений пока нет.</p>}{history.length > 50 && <p className={styles.note}>Показаны последние 50 событий.</p>}</div>}
    </section>}
    <div className={styles.listHeading}><span>Учётные записи · {visible.length} из {accounts.length}</span><span>{visible.length ? `${(currentPage - 1) * 20 + 1}–${Math.min(currentPage * 20, visible.length)}` : "0"}</span></div>
    <div className={styles.list}>{shown.map((entry) => <article className={styles.card} key={entry.id}><div className={styles.identity}><strong>{entry.name}{entry.id === currentUser.id && <small>Вы</small>}</strong><span>{entry.login}</span>{entry.studentRecord && <span>Зачетка {entry.studentRecord.number}</span>}</div><div className={styles.details}><span className={styles.role}>{ACCOUNT_ROLE_LABELS[entry.role]}</span><span className={!isAccountActive(entry) ? styles.blocked : ""}>{isAccountActive(entry) ? "Активна" : "Заблокирована"}</span>{entry.role === "student" && <span>{getAcademicGroup(getStudentGroupId(entry))?.name}</span>}</div><button type="button" disabled={busy} onClick={() => open(entry)} aria-label={`Открыть учётную запись: ${entry.name}`}>Открыть</button></article>)}</div>
    {!visible.length && !accountError && <div className={styles.empty}>Учётные записи не найдены.</div>}
    {pageCount > 1 && <nav className={styles.pagination} aria-label="Страницы учётных записей"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Далее</button></nav>}
    {confirmation && account && <ConfirmDialog title={confirmation === "save" ? editor?.mode === "role" ? "Изменить тип учётной записи?" : "Изменить данные студента?" : confirmation === "issue" ? "Выдать номер зачетки?" : confirmation === "block" ? "Заблокировать учётную запись?" : "Восстановить доступ?"} confirmLabel={confirmation === "save" ? "Сохранить" : confirmation === "issue" ? "Выдать номер" : confirmation === "block" ? "Заблокировать" : "Восстановить"} busy={busy} error={error} onCancel={() => { setConfirmation(null); setError(""); }} onConfirm={() => void (confirmation === "save" ? save() : executeAccess())}><p>{account.name} · {account.login}</p><p>{confirmation === "issue" ? `Номер ${preview?.number ?? ""} станет постоянным и не будет редактироваться.` : confirmation === "block" ? "Доступ к кабинету будет закрыт, учебные данные и история сохранятся." : confirmation === "save" && editor?.mode === "role" ? `${ACCOUNT_ROLE_LABELS[account.role]} → ${ACCOUNT_ROLE_LABELS[editor.draft.role]}. Доступ изменится сразу.` : confirmation === "save" ? "Студент получит доступ к данным выбранной группы. Прежние результаты сохранятся в истории." : "Пользователь снова сможет открыть кабинет."}</p>{confirmation === "save" && educationDirty && editor && <EducationEventSummary value={editor.education} />}</ConfirmDialog>}
    {resetOpen && account && <PasswordResetDialog account={account} onClose={() => setResetOpen(false)} onEditEmail={() => { setResetOpen(false); changeMode("details"); }} />}
  </div>;
};
export default AdminAccountsPage;
