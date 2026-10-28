import { EducationEventSummary, emptyEducationDetails } from "../../components/EducationEventFields";
import { hasEducationDetailsChanges } from "../../components/EducationEventFields/presentation";
import type { EducationEventDetails } from "../../domain/studentEducationEvent";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import Link from "../../components/ChecksContextLink";
import { ACCOUNT_ROLE_LABELS, getAccountBlockRestriction, getAccountRoleRestriction, getMissingStudentGroupProblem, getStudentGroupId, isAccountActive, isUserRole, type AccountDraft, type PortalAccount, type UserRole } from "../../domain/accounts";
import { matchesSearchText } from "../../domain/search";
import { accountService, readAccountsState } from "../../data/accountStore";
import { ACADEMIC_GROUPS, getAcademicGroup } from "../../data/academicCatalog";
import { changesAdminAccount } from "../../domain/unsavedNavigation";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useSubjectCatalog } from "../../hooks/useSubjectCatalog";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import { useStudentNumberPreview } from "../../hooks/useStudentNumberPreview";
import SearchField from "../../components/SearchField";
import Dropdown from "../../components/Dropdown";
import ConfirmDialog from "../../components/ConfirmDialog";
import Tabs from "../../components/Tabs";
import PasswordResetDialog from "./PasswordResetDialog";
import styles from "./index.module.scss";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import { getAccountSections, resolveAccountEditorMode, type AccountEditorMode } from "./presentation";
import AccountEditorForm from "./AccountEditorForm";
import StudentRecordPanel from "./StudentRecordPanel";
import { getAccountSubmitState } from "./accountSubmitState";
import { refreshAccountCreation } from "./accountCreationRefresh";
import { getUsableStudentNumberPreview } from "../../hooks/studentNumberRequestState";
import { readGroupCatalogState } from "../../data/groupCatalogStore";
import { applyEducationRefresh, isEducationRefreshStale, prepareEducationRefresh, type EducationRefreshReview } from "./educationRefresh";
import EducationRefreshPanel from "./EducationRefreshPanel";
import { applyEducationSwitch, prepareEducationSwitch, type EducationSwitchReview } from "./educationOperationSwitch";
import AccountDetailsRefreshPanel from "./AccountDetailsRefreshPanel";
import { accountDetailsDraftFrom, applyAccountDetailsRefresh, isAccountDetailsReviewStale, prepareAccountDetailsRefresh, type AccountDetailsReview } from "./accountDetailsRefresh";
import { isGroupActive } from "../../domain/groupCatalog";
import AccountHistory from "./AccountHistory";
import AccountAccess from "./AccountAccess";
import AccountActionSummary from "./AccountActionSummary";
import { getAccountActionReview } from "./actionReview";
import EducationOperations from "./EducationOperations";
import AdministrationReturnNotice from "../../components/AdministrationReturnNotice";
import { EDUCATION_OPERATIONS, getEducationOperationProblem, getEducationOperations, prepareEducationOperation, type EducationOperation } from "./educationOperationModel";

const roleOptions = (Object.keys(ACCOUNT_ROLE_LABELS) as UserRole[]).map((value) => ({ value, label: ACCOUNT_ROLE_LABELS[value] }));
type Mode = AccountEditorMode;
type Editor = { account?: PortalAccount; draft: AccountDraft; baseline: string; revision: number; actorId: string; actorRevision: number; mode: Mode; education: EducationEventDetails; educationBaseline: EducationEventDetails; educationOperation: EducationOperation | null; educationGroupRevision?: number };
type Confirmation = "save" | "block" | "activate" | "issue" | null;
const accountIntent = (params: URLSearchParams) => JSON.stringify([params.get("account"), params.get("create"), params.get("mode")]);
const detailsEqual = (draft: AccountDraft, account: PortalAccount) => draft.name === account.name && draft.login === account.login && (draft.email ?? "") === (account.email ?? "") && (draft.enrollmentStatus ?? "studying") === (account.enrollmentStatus ?? "studying") && getStudentGroupId(draft) === getStudentGroupId(account) && JSON.stringify(draft.memberships) === JSON.stringify(account.memberships);
const makeAccountEditor = (actorId: string, target?: PortalAccount, mode: Mode = "details", groupId?: string): Editor => {
  const snapshot = readAccountsState();
  const actor = snapshot.accounts.find((entry) => entry.id === actorId);
  if (snapshot.error || !actor) throw new Error(snapshot.error || "Обновите учётные записи.");
  const group = getAcademicGroup(groupId);
  const draft: AccountDraft = target ? accountDetailsDraftFrom(target) : { name: "", login: "", email: "", role: "student", memberships: [], studentGroupId: group?.id, studentCampus: group?.campus };
  const education = emptyEducationDetails();
  return { education, educationBaseline: { ...education }, educationOperation: null, account: target, revision: snapshot.revision, actorId, actorRevision: actor.revision, mode: target ? mode : "create", draft, baseline: JSON.stringify(draft) };
};

const AdminAccountsPage = () => {
  const { accounts, currentUser, role, accountError, refreshAccounts } = useRole();
  const { error: catalogError, refresh: refreshCatalog } = useSubjectCatalog();
  const groupCatalog = useGroupCatalog();
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
  const [detailsReview, setDetailsReview] = useState<AccountDetailsReview | null>(null);
  const [educationReview, setEducationReview] = useState<EducationRefreshReview | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<EducationSwitchReview | null>(null);
  const [detailsFocus, setDetailsFocus] = useState(0);
  const intentRef = useRef<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const listHeadingRef = useRef<HTMLDivElement | null>(null);
  const wasEditorOpen = useRef(false);
  const editorOpen = Boolean(editor);
  const account = editor?.account;
  const educationDirty = Boolean(editor?.mode === "education" && account?.role === "student" && (getStudentGroupId(editor.draft) !== getStudentGroupId(account) || (editor.draft.enrollmentStatus ?? "studying") !== (account.enrollmentStatus ?? "studying")));
  const detailsDirty = Boolean(editor && account && !detailsEqual(editor.draft, account));
  const dirty = Boolean(editor && (editor.mode === "create" ? JSON.stringify(editor.draft) !== editor.baseline : editor.mode === "role" ? editor.draft.role !== account?.role : ["details", "education"].includes(editor.mode) && (detailsDirty || editor.draft.studentCampus || (editor.mode === "education" && hasEducationDetailsChanges(editor.education, editor.educationBaseline)))));
  useUnsavedChangesWarning(dirty || busy, changesAdminAccount);
  const needsNumber = Boolean(editor && editor.draft.role === "student" && !account?.studentRecord && (["create", "role"].includes(editor.mode) || (editor.mode === "education" && !editor.educationOperation)));
  const numberScope = JSON.stringify([editor?.account?.id ?? "new", editor?.mode, editor?.draft.role, editor?.revision]);
  const number = useStudentNumberPreview(needsNumber && editor?.actorId === currentUser.id, editor?.draft.studentCampus ?? 0, currentUser.id, editor?.actorRevision ?? 0, numberScope);
  const preview = needsNumber ? getUsableStudentNumberPreview(number, editor?.draft.studentCampus, editor?.revision, new Date().toISOString()) : null;
  useEffect(() => {
    if (editorOpen) { wasEditorOpen.current = true; return; }
    if (!wasEditorOpen.current) return;
    const trigger = triggerRef.current;
    (trigger?.isConnected && !trigger.matches(":disabled") ? trigger : listHeadingRef.current)?.focus();
    triggerRef.current = null; wasEditorOpen.current = false;
  }, [editorOpen]);
  useLayoutEffect(() => {
    const key = accountIntent(params);
    if (intentRef.current === key) return;
    intentRef.current = key;
    setConfirmation(null); setResetOpen(false); setDetailsReview(null); setEducationReview(null); setPendingSwitch(null); setError("");
    try {
      const id = params.get("account");
      const target = id ? accounts.find((entry) => entry.id === id) : undefined;
      if (id && !target) throw new Error("Учётная запись не найдена. Выберите её в списке.");
      const mode = resolveAccountEditorMode(params.get("mode"), target?.role ?? "student");
      const creationRole = params.get("create");
      const nextEditor = target ? makeAccountEditor(currentUser.id, target, mode) : creationRole === "student" || creationRole === "teacher" ? makeAccountEditor(currentUser.id, undefined, "create", creationRole === "student" ? params.get("group") ?? undefined : undefined) : null;
      if (nextEditor && !target && creationRole === "teacher") { nextEditor.draft.role = "teacher"; nextEditor.baseline = JSON.stringify(nextEditor.draft); }
      setEditor(nextEditor);
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
  const historyState = readAccountsState();
  const groupError = editor?.draft.role === "student" ? groupCatalog.error : "";
  const blocked = Boolean(accountError || catalogError || groupError || historyState.error) || busy;
  const history = historyState.history.filter((entry) => entry.accountId === account?.id).slice().reverse();
  const educationEvents = historyState.educationEvents.filter((entry) => entry.accountId === account?.id);
  const educationProblem = account && editor?.mode === "education" ? getEducationOperationProblem(account, editor.draft, editor.educationOperation, editor.education, educationEvents, groupCatalog.groups, new Date().toISOString()) : "";
  const stale = Boolean(editor && (editor.actorId !== currentUser.id || editor.revision !== historyState.revision || editor.actorRevision !== accounts.find((entry) => entry.id === currentUser.id)?.revision || (account && accounts.find((entry) => entry.id === account.id)?.revision !== account.revision) || (editor.mode === "education" && editor.educationOperation && editor.educationGroupRevision !== groupCatalog.revision)));
  const educationEditor = editor && account && editor.educationOperation ? { ...editor, account, educationOperation: editor.educationOperation, educationGroupRevision: editor.educationGroupRevision ?? -1 } : null;
  const educationReviewStale = Boolean(educationReview && isEducationRefreshStale(educationReview, { ...historyState, actorId: currentUser.id, groups: groupCatalog.groups, groupRevision: groupCatalog.revision, groupError: groupCatalog.error }));
  const detailsReviewStale = Boolean(detailsReview && isAccountDetailsReviewStale(detailsReview, { ...historyState, actorId: currentUser.id }));
  const blockRestriction = account ? getAccountBlockRestriction(account, currentUser.id, accounts) : "";
  const roleRestriction = account && editor?.mode === "role" ? getAccountRoleRestriction(account, editor.draft.role, accounts) : "";
  const formReview = account && editor && (editor.mode === "role" || educationDirty) ? getAccountActionReview(editor.mode === "role" ? "role" : "education", account, editor.draft, ACADEMIC_GROUPS, preview?.number) : null;
  const actionReview = confirmation === "save" ? formReview : confirmation && account && editor ? getAccountActionReview(confirmation, account, editor.draft, ACADEMIC_GROUPS, preview?.number) : null;
  const confirmationRestriction = confirmation === "block" ? blockRestriction : confirmation === "save" ? roleRestriction || educationProblem : "";
  const confirmationNeedsNumber = confirmation === "issue" || (confirmation === "save" && editor?.mode === "role" && needsNumber);
  const confirmationDisabled = blocked || stale || Boolean(confirmationRestriction || actionReview?.validationMessage) || (confirmationNeedsNumber && !preview);
  const submitState = editor ? getAccountSubmitState({ mode: editor.mode === "create" ? "create" : editor.mode === "role" ? "role" : "details", busy, unavailable: Boolean(accountError || catalogError || groupError || historyState.error), stale, restriction: roleRestriction, needsNumber, hasNumber: Boolean(preview), campus: editor.draft.studentCampus, numberLoading: number.loading, numberError: number.error, missingGroup: Boolean(getMissingStudentGroupProblem(editor.draft)), changed: editor.mode === "role" ? editor.draft.role !== account?.role : detailsDirty }) : null;
  if (role !== "configurator") return <div className={styles.empty}>Управление учётными записями доступно настройщику.</div>;

  const open = (target?: PortalAccount, mode: Mode = "details") => requestAction(() => {
    try {
      if (!editor) triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const nextEditor = makeAccountEditor(currentUser.id, target, mode);
      setEditor(nextEditor); setDetailsReview(null); setEducationReview(null); setPendingSwitch(null); setError(""); setMessage(""); setConfirmation(null);
      setParams((previous) => { const next = new URLSearchParams(previous); if (next.get("account") !== target?.id) next.delete("auditPage"); if (target) { next.set("account", target.id); next.set("mode", mode); next.delete("create"); } else { next.set("create", "student"); next.delete("account"); next.delete("mode"); } intentRef.current = accountIntent(next); return next; });
    }
    catch (failure) { console.error("Не удалось открыть учётную запись:", failure); setError(failure instanceof Error ? failure.message : "Не удалось открыть учётную запись."); }
  });
  const close = () => requestAction(() => { setEditor(null); setDetailsReview(null); setEducationReview(null); setPendingSwitch(null); setError(""); setConfirmation(null); setParams((previous) => { const next = new URLSearchParams(previous); next.delete("account"); next.delete("create"); next.delete("mode"); next.delete("auditPage"); intentRef.current = accountIntent(next); return next; }); });
  const openExistingMode = (mode: string) => {
    const latest = accounts.find((entry) => entry.id === account?.id);
    if (!latest) { console.error("Учётная запись для обновления карточки не найдена:", account?.id); setError("Учётная запись больше недоступна. Введённые данные оставлены в форме; вернитесь к списку."); return; }
    open(latest, resolveAccountEditorMode(mode, latest.role));
  };
  const changeMode = (mode: string) => { if (!busy && mode !== editor?.mode && account) openExistingMode(mode); };
  const refreshCreation = () => {
    if (!editor || account || editor.mode !== "create" || busy) return;
    try {
      const next = refreshAccountCreation(editor, { ...readAccountsState(), actorId: currentUser.id });
      setEditor({ ...editor, ...next }); setError(""); setConfirmation(null);
      setDetailsFocus((value) => value + 1);
      number.refresh();
      setMessage(editor.draft.role === "student" && editor.draft.studentCampus ? "Проверка обновлена. Введённые данные сохранены; дождитесь актуального номера зачетки и проверьте его перед созданием." : "Проверка обновлена. Введённые данные сохранены; учётка ещё не создана.");
    } catch (failure) { console.error("Не удалось обновить проверку новой учётки:", failure); setError(failure instanceof Error ? failure.message : "Не удалось обновить проверку. Введённые данные оставлены в форме."); }
  };
  const refreshDetails = () => {
    if (!editor || !account || editor.mode !== "details" || busy) return;
    try {
      const next = prepareAccountDetailsRefresh({ ...editor, account }, { ...readAccountsState(), actorId: currentUser.id });
      setConfirmation(null); setError(""); setMessage("");
      if (next.review) setDetailsReview(next.review);
      else { setEditor({ ...editor, ...next.editor }); setDetailsReview(null); setDetailsFocus((value) => value + 1); setMessage("Проверка обновлена. Ваш ввод сохранён; запись выполняется отдельно."); }
    } catch (failure) { console.error("Не удалось обновить проверку личных данных учётки:", failure); setError(failure instanceof Error ? failure.message : "Не удалось обновить проверку. Введённые данные оставлены в форме."); }
  };
  const chooseDetails = (choice: "mine" | "saved") => {
    if (!editor || !account || !detailsReview || busy) return;
    try {
      const next = applyAccountDetailsRefresh({ ...editor, account }, detailsReview, { ...readAccountsState(), actorId: currentUser.id }, choice);
      setEditor({ ...editor, ...next }); setDetailsReview(null); setConfirmation(null); setError(""); setDetailsFocus((value) => value + 1);
      setMessage(choice === "mine" && !detailsEqual(next.draft, next.account) ? "Ваши изменённые поля сохранены в форме, остальные данные обновлены. Для записи нажмите «Сохранить изменения»." : "В форме актуальные сохранённые данные. Изменений для записи нет.");
    } catch (failure) { console.error("Не удалось применить выбор личных данных учётки:", failure); setError(failure instanceof Error ? failure.message : "Не удалось выбрать вариант. Обновите сравнение."); }
  };
  const updateDraft = (patch: Partial<AccountDraft>) => { setEditor((previous) => previous ? { ...previous, draft: { ...previous.draft, ...patch } } : previous); setError(""); setMessage(""); };
  const educationSource = () => { const groups = readGroupCatalogState(); return { ...readAccountsState(), actorId: currentUser.id, groups: groups.groups, groupRevision: groups.revision, groupError: groups.error }; };
  const refreshEducation = () => {
    if (!educationEditor || busy) return;
    try { setEducationReview(prepareEducationRefresh(educationEditor, educationSource(), new Date().toISOString())); setConfirmation(null); setError(""); setMessage(""); }
    catch (failure) { console.error("Не удалось обновить проверку учебной операции:", failure); setError(failure instanceof Error ? failure.message : "Не удалось обновить проверку. Дата и основание оставлены в форме."); }
  };
  const continueEducation = () => {
    if (!educationEditor || !educationReview || busy) return;
    try { const next = applyEducationRefresh(educationEditor, educationReview, educationSource()); setEditor((previous) => previous ? { ...previous, ...next } : previous); setEducationReview(null); setConfirmation(null); setError(""); setMessage("Учебные данные обновлены, ваш ввод сохранён. Проверьте форму; событие ещё не записано."); }
    catch (failure) { console.error("Не удалось продолжить учебную операцию после обновления:", failure); setError(failure instanceof Error ? failure.message : "Сравнение изменилось. Обновите его перед продолжением."); }
  };
  const switchEducation = (review: EducationSwitchReview) => {
    if (!educationEditor || busy) return;
    try {
      const next = applyEducationSwitch(educationEditor, review, educationSource());
      setEditor((previous) => previous ? { ...previous, ...next } : previous); setPendingSwitch(null); setEducationReview(null); setConfirmation(null); setError("");
      setMessage("Действие изменено. Дата и документ сохранены в форме; проверьте, что основание подходит новому действию. Событие ещё не записано.");
    } catch (failure) { console.error("Не удалось сменить учебное действие:", failure); setError(failure instanceof Error ? failure.message : "Не удалось сменить действие. Введённые данные сохранены."); }
  };
  const chooseEducationOperation = (operation: EducationOperation | null) => {
    if (!editor || !account || editor.mode !== "education" || busy || (operation && (blocked || stale || !getEducationOperations(account).includes(operation)))) return;
    if (operation && educationEditor) {
      if (operation === educationEditor.educationOperation) return;
      try { const review = prepareEducationSwitch(educationEditor, operation, educationSource()); setError(""); if (review.discardedGroup) setPendingSwitch(review); else switchEducation(review); }
      catch (failure) { console.error("Не удалось подготовить смену учебного действия:", failure); setError(failure instanceof Error ? failure.message : "Не удалось подготовить смену действия. Введённые данные сохранены."); }
      return;
    }
    requestAction(() => {
      const education = emptyEducationDetails();
      setEditor((previous) => previous ? { ...previous, educationOperation: operation, educationGroupRevision: operation ? groupCatalog.revision : undefined, draft: prepareEducationOperation(account, previous.draft, operation), education, educationBaseline: { ...education } } : previous);
      setEducationReview(null); setPendingSwitch(null); setError(""); setMessage(""); setConfirmation(null);
    });
  };
  const finish = (updated: PortalAccount, text: string) => { setConfirmation(null); setEditor(makeAccountEditor(currentUser.id, updated, editor?.mode === "create" ? "details" : editor?.mode)); setMessage(text); if (editor?.mode === "create") setSavedAccountId(updated.id); };
  const save = async () => {
    if (!editor || detailsReview || educationReview || pendingSwitch || blocked || stale || roleRestriction || educationProblem || actionReview?.validationMessage || (needsNumber && !preview && !["details", "education"].includes(editor.mode))) return;
    setBusy(true); setError("");
    try {
      const context = { actorId: currentUser.id, actorRevision: editor.actorRevision, expectedRevision: editor.revision };
      const target = account ? { ...context, accountId: account.id, accountRevision: account.revision } : null;
      let updated: PortalAccount;
      if (!account) updated = await accountService.create({ ...context, draft: editor.draft, expectedStudentNumber: preview?.number });
      else if (editor.mode === "role") updated = await accountService.changeRole({ ...target!, role: editor.draft.role, memberships: editor.draft.memberships, studentGroupId: editor.draft.studentGroupId, studentCampus: editor.draft.studentCampus, expectedStudentNumber: preview?.number });
      else updated = await accountService.updateDetails({ ...target!, ...(educationDirty ? { education: editor.education } : {}), details: { name: editor.draft.name, login: editor.draft.login, email: editor.draft.email, ...(account.role === "student" ? { memberships: editor.draft.memberships, studentGroupId: editor.draft.studentGroupId, enrollmentStatus: editor.draft.enrollmentStatus } : {}) } });
      finish(updated, !account ? "Учётная запись создана." : editor.mode === "education" && editor.educationOperation ? EDUCATION_OPERATIONS[editor.educationOperation].success : "Изменения сохранены.");
    } catch (failure) { console.error("Не удалось сохранить учётную запись:", failure); setError(failure instanceof Error ? failure.message : "Не удалось сохранить учётную запись."); if (needsNumber) { setConfirmation(null); number.refresh(); } }
    finally { setBusy(false); }
  };
  const executeAccess = async () => {
    if (!editor || !account || confirmationDisabled || !confirmation || !["block", "activate", "issue"].includes(confirmation)) return;
    setBusy(true); setError("");
    try {
      const target = { actorId: currentUser.id, actorRevision: editor.actorRevision, expectedRevision: editor.revision, accountId: account.id, accountRevision: account.revision };
      const updated = confirmation === "issue" ? await accountService.issueStudentRecord({ ...target, campus: editor.draft.studentCampus!, expectedStudentNumber: preview!.number }) : await accountService.changeStatus({ ...target, status: confirmation === "block" ? "blocked" : "active" });
      finish(updated, confirmation === "issue" ? `Номер зачетки выдан: ${updated.studentRecord!.number}.` : `Учётная запись ${isAccountActive(updated) ? "активирована" : "заблокирована"}.`);
    } catch (failure) { console.error("Не удалось выполнить действие с учётной записью:", failure); setError(failure instanceof Error ? failure.message : "Не удалось выполнить действие."); if (confirmation === "issue") { setConfirmation(null); number.refresh(); } }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (blocked || stale || pendingSwitch || educationReview || detailsReview) return; if (educationProblem) { setError(educationProblem); return; } if (account && (editor?.mode === "role" || educationDirty || getStudentGroupId(account) !== getStudentGroupId(editor!.draft))) setConfirmation("save"); else void save(); };
  const filter = (key: string, value: string) => setParams((previous) => { const next = new URLSearchParams(previous); if (value && value !== "all") next.set(key, value); else next.delete(key); next.delete("page"); return next; }, { replace: true });
  const setPage = (value: number) => setParams((previous) => { const next = new URLSearchParams(previous); if (value > 1) next.set("page", String(value)); else next.delete("page"); return next; });
  const studentNumber = <StudentRecordPanel needsNumber={needsNumber} record={account?.studentRecord} campus={editor?.draft.studentCampus} preview={preview} loading={number.loading} error={number.error} disabled={blocked} busy={busy} stale={stale} issuing={Boolean(account && editor?.mode === "education")} detailsDirty={detailsDirty} onCampus={(studentCampus) => updateDraft({ studentCampus })} onRefresh={editor?.mode === "create" ? refreshCreation : number.refresh} onIssue={() => setConfirmation("issue")} />;
  return <div className={`pageContainer ${styles.page}`}>
    <AdministrationReturnNotice />
    <div className={styles.registry} hidden={editorOpen}><div className={styles.toolbar}>
      <SearchField label="Поиск учётных записей" value={query} onChange={(value) => filter("q", value)} placeholder="" />
      <Dropdown label="Тип учётной записи в списке" value={type} options={[{ value: "all", label: "Все типы" }, ...roleOptions]} onChange={(value) => filter("type", value)} />
      <Dropdown label="Статус в списке" value={status} options={[{ value: "all", label: "Все статусы" }, { value: "active", label: "Активные" }, { value: "blocked", label: "Заблокированные" }]} onChange={(value) => filter("status", value)} />
      <Dropdown searchable label="Группа в списке студентов" value={groupFilter} options={[{ value: "all", label: "Все группы" }, ...ACADEMIC_GROUPS.map((group) => ({ value: group.id, label: group.name }))]} onChange={(value) => filter("group", value)} />
      <div className={styles.toolbarActions}><button type="button" className={styles.primary} disabled={blocked} onClick={() => open()}>Создать учётную запись</button><Link className={styles.importLink} to={`/admin/accounts/import${groupFilter !== "all" ? `?group=${encodeURIComponent(groupFilter)}` : ""}`}>Импорт студентов</Link></div>
    </div>
    </div>
    {(accountError || catalogError || groupError || historyState.error) && <div role="alert" className={styles.error}><p>{accountError || catalogError || groupError || historyState.error}</p><button type="button" onClick={() => { refreshAccounts(); refreshCatalog(); groupCatalog.refresh(); }}>Повторить чтение</button></div>}
    {message && <p role="status" className={styles.message}>{message}</p>}
    {error && !confirmation && !pendingSwitch && <p role="alert" className={styles.error}>{error}</p>}
    {editor && <RecordEditor key={`${account?.id ?? "new"}:${editor.mode}`} title={account?.name ?? "Новая учётная запись"} context={account ? `${ACCOUNT_ROLE_LABELS[account.role]} · ${account.login} · ${isAccountActive(account) ? "Доступ открыт" : "Доступ заблокирован"}` : "Создание в реестре учётных записей"} dirty={editor.mode === "education" ? editor.educationOperation || editor.draft.studentCampus ? dirty : undefined : ["create", "details", "role"].includes(editor.mode) ? dirty : undefined} busy={busy} closeLabel={editor.mode === "role" ? "К доступу" : editor.mode === "education" && editor.educationOperation ? "К обучению" : "К списку"} onClose={editor.mode === "role" ? () => changeMode("access") : editor.mode === "education" && editor.educationOperation ? () => chooseEducationOperation(null) : close}>
      {account && <fieldset disabled={busy} className={styles.accountTabGroup}><Tabs className={styles.accountTabs} ariaLabel="Управление учётной записью" items={getAccountSections(account.role)} value={editor.mode === "role" ? "access" : editor.mode} onChange={changeMode} /></fieldset>}
      {stale && !detailsReview && !educationReview && <p role="alert" className={styles.error}>Данные или права изменились. Обновите карточку перед сохранением или действием; текущий ввод остаётся в форме. <button type="button" disabled={busy} onClick={() => educationEditor ? refreshEducation() : editor.mode === "create" ? refreshCreation() : account && editor.mode === "details" ? refreshDetails() : account ? openExistingMode(editor.mode) : open()}>{educationEditor || editor.mode === "create" || editor.mode === "details" ? "Обновить проверку" : "Обновить карточку"}</button></p>}
      {detailsReview && account && editor.mode === "details" && <AccountDetailsRefreshPanel editor={{ ...editor, account }} review={detailsReview} stale={detailsReviewStale} disabled={blocked} busy={busy} onRefresh={refreshDetails} onChoose={chooseDetails} onCancel={() => { setDetailsReview(null); setDetailsFocus((value) => value + 1); }} />}
      {!detailsReview && ["create", "details", "role"].includes(editor.mode) && <AccountEditorForm mode={editor.mode} draft={editor.draft} account={account} accounts={accounts} groups={ACADEMIC_GROUPS.filter((group) => isGroupActive(group) || group.id === getStudentGroupId(editor.draft)).map((group) => ({ value: group.id, label: `${group.name}${isGroupActive(group) ? "" : " · В архиве"}` }))} disabled={blocked} stale={stale} focusRequest={editor.mode === "details" || editor.mode === "create" ? detailsFocus : 0} onChange={updateDraft} onSubmit={submit}>
        {roleRestriction && <p className={styles.error} role="status">{roleRestriction}</p>}
        {editor.mode !== "details" && studentNumber}
        {editor.mode === "create" && editor.draft.role === "teacher" && <p className={styles.assignmentNote}>Предметы и группы преподавателя назначаются в разделе <Link to="/admin/subjects">«Дисциплины»</Link>.</p>}
        <RecordEditorActions label={editor.mode === "create" ? "Создать учётную запись" : editor.mode === "role" ? "Проверить смену типа" : "Сохранить изменения"} disabled={submitState?.disabled ?? true} busy={busy} onCancel={editor.mode === "role" ? () => changeMode("access") : close} hint={submitState?.hint} />
      </AccountEditorForm>}
      {educationReview && educationEditor && editor.mode === "education" && <EducationRefreshPanel editor={educationEditor} review={educationReview} stale={educationReviewStale} disabled={blocked} busy={busy} onContinue={continueEducation} onRefresh={refreshEducation} onCancel={() => setEducationReview(null)} />}
      {!educationReview && account?.role === "student" && editor.mode === "education" && <>
        <EducationOperations account={account} draft={editor.draft} operation={editor.educationOperation} education={editor.education} groups={groupCatalog.groups} busy={busy} disabled={blocked} stale={stale} problem={educationProblem} lastEventDate={educationEvents.at(-1)?.effectiveDate} onChoose={chooseEducationOperation} onGroup={(id) => updateDraft({ studentGroupId: id, memberships: [] })} onEducation={(education) => setEditor((previous) => previous ? { ...previous, education } : previous)} onCancel={() => chooseEducationOperation(null)} onSubmit={submit} />
        {!editor.educationOperation && (account.studentRecord ? studentNumber : <details className={styles.numberDisclosure}><summary>Выдать номер зачетки</summary>{studentNumber}</details>)}
      </>}
      {account && editor.mode === "assignments" && <article className={styles.accessCard}><h3>Дисциплины и группы</h3><p>Дисциплин: {account.memberships.length} · Групп: {new Set(account.memberships.flatMap((entry) => entry.groupIds)).size}</p><p>Назначения редактируются в карточке дисциплины.</p><Link className={styles.importLink} to={`/admin/subjects?teacher=${encodeURIComponent(account.id)}`}>Открыть назначения преподавателя</Link></article>}
      {account && editor.mode === "access" && <AccountAccess account={account} blockRestriction={blockRestriction} busy={busy} unavailable={Boolean(accountError || catalogError || historyState.error)} stale={stale} onStatus={() => setConfirmation(isAccountActive(account) ? "block" : "activate")} onRole={() => changeMode("role")} onReset={() => setResetOpen(true)} />}
      {account?.role === "student" && editor.mode === "education" && !editor.educationOperation && <Link className={styles.importLink} to={`/admin/students/${encodeURIComponent(account.id)}/education`}>История обучения · даты и основания</Link>}
      {account && editor.mode === "history" && <AccountHistory accountId={account.id} entries={history} accounts={accounts} createdAt={account.createdAt} requestedPage={params.get("auditPage")} unavailable={Boolean(accountError || historyState.error)} onPage={(value) => setParams((previous) => { const next = new URLSearchParams(previous); if (value > 1) next.set("auditPage", String(value)); else next.delete("auditPage"); return next; })} />}
    </RecordEditor>}
    <div className={styles.registry} hidden={editorOpen}>
    <div ref={listHeadingRef} tabIndex={-1} className={styles.listHeading}><span>Учётные записи · {visible.length} из {accounts.length}</span><span>{visible.length ? `${(currentPage - 1) * 20 + 1}–${Math.min(currentPage * 20, visible.length)}` : "0"}</span></div>
    <div className={styles.list}>{shown.map((entry) => <article className={styles.card} key={entry.id}><div className={styles.identity}><strong>{entry.name}{entry.id === currentUser.id && <small>Вы</small>}</strong><span>{entry.login}</span>{entry.studentRecord && <span>Зачетка {entry.studentRecord.number}</span>}</div><div className={styles.details}><span className={styles.role}>{ACCOUNT_ROLE_LABELS[entry.role]}</span><span className={!isAccountActive(entry) ? styles.blocked : ""}>{isAccountActive(entry) ? "Активна" : "Заблокирована"}</span>{entry.role === "student" && <span>{getAcademicGroup(getStudentGroupId(entry))?.name}</span>}</div><button type="button" disabled={busy} onClick={() => open(entry)} aria-label={`Открыть учётную запись: ${entry.name}`}>Открыть</button></article>)}</div>
    {!visible.length && !accountError && <div className={styles.empty}>Учётные записи не найдены.</div>}
    {pageCount > 1 && <nav className={styles.pagination} aria-label="Страницы учётных записей"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Далее</button></nav>}
    </div>
    {confirmation && account && actionReview && <ConfirmDialog title={actionReview.title} confirmLabel={actionReview.confirmLabel} cancelLabel={confirmation === "save" || confirmation === "issue" ? "Вернуться к форме" : "Отмена"} busy={busy} confirmDisabled={confirmationDisabled} error={error || accountError || catalogError || groupError || historyState.error} onCancel={() => { setConfirmation(null); setError(""); }} onConfirm={() => void (confirmation === "save" ? save() : executeAccess())}>
      <p><strong>{account.name}</strong> · {account.login}</p><AccountActionSummary review={actionReview} />
      {confirmation === "save" && educationDirty && editor && <EducationEventSummary value={editor.education} />}
      {confirmationRestriction && <p role="alert">{confirmationRestriction}</p>}
      {stale && <p role="alert">Данные или права изменились. Вернитесь к карточке и обновите её перед применением.</p>}
      {confirmationNeedsNumber && !preview && <p role="alert">Предпросмотр номера недоступен. Вернитесь к форме и получите актуальный номер перед подтверждением.</p>}
    </ConfirmDialog>}
    {pendingSwitch && <ConfirmDialog title="Сменить учебное действие?" confirmLabel="Сменить действие" cancelLabel="Оставить текущее" confirmDisabled={blocked || stale} busy={busy} error={error || accountError || catalogError || groupError || historyState.error} onConfirm={() => switchEducation(pendingSwitch)} onCancel={() => { setPendingSwitch(null); setError(""); }}>
      <p>Новое действие: <strong>{EDUCATION_OPERATIONS[pendingSwitch.operation].label}</strong>.</p><p>Группа перевода <strong>{pendingSwitch.discardedGroup}</strong> будет снята из формы. Новое действие относится к текущей группе студента.</p><p>Дата, основание и реквизиты документа сохранятся. Событие ещё не записывается.</p>{stale && <p role="alert">Данные или права изменились. Вернитесь к форме и обновите проверку перед сменой действия.</p>}
    </ConfirmDialog>}
    {resetOpen && account && <PasswordResetDialog account={account} onClose={() => setResetOpen(false)} onEditEmail={() => { setResetOpen(false); changeMode("details"); }} />}
  </div>;
};
export default AdminAccountsPage;
