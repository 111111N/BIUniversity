import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ACCOUNT_ROLE_LABELS, type AccountDraft, type AcademicMembership, type PortalAccount, type UserRole } from "../../domain/accounts";
import { accountService, readAccountsState } from "../../data/accountStore";
import { ACADEMIC_GROUPS, SUBJECT_GROUP_OFFERINGS, getAcademicGroup, getAcademicSubjectDefinition } from "../../data/academicCatalog";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useSubjectCatalog } from "../../hooks/useSubjectCatalog";
import SearchField from "../../components/SearchField";
import Dropdown from "../../components/Dropdown";
import ConfirmDialog from "../../components/ConfirmDialog";
import styles from "./index.module.scss";

const roleOptions = (Object.keys(ACCOUNT_ROLE_LABELS) as UserRole[]).map((value) => ({ value, label: ACCOUNT_ROLE_LABELS[value] }));
const studentMemberships = (groupId: string): AcademicMembership[] => SUBJECT_GROUP_OFFERINGS.filter((offering) => offering.groupId === groupId).map((offering) => ({ subjectId: offering.subjectId, groupIds: [groupId] }));
type Editor = { account?: PortalAccount; draft: AccountDraft; revision: number; actorRevision: number };

const AdminAccountsPage = () => {
  const { accounts, currentUser, role, accountError } = useRole();
  const { error: catalogError } = useSubjectCatalog();
  const { requestAction } = useUnsavedChangesGuard();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = Boolean(editor && (editor.account ? editor.draft.role !== editor.account.role : editor.draft.name.trim() || editor.draft.login.trim() || editor.draft.memberships.length));
  useUnsavedChangesWarning(dirty || busy);
  const visible = useMemo(() => accounts.filter((account) => (type === "all" || account.role === type) && `${account.name} ${account.login}`.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"))), [accounts, type, query]);
  if (role !== "configurator") return <div className={styles.empty}>Управление учётными записями доступно настройщику.</div>;

  const openEditor = (account?: PortalAccount) => requestAction(() => {
    const snapshot = readAccountsState();
    const actor = snapshot.accounts.find((entry) => entry.id === currentUser.id);
    if (snapshot.error || !actor) { setError(snapshot.error || "Обновите учётные записи."); return; }
    setError(""); setMessage(""); setConfirm(false);
    setEditor({ account, revision: snapshot.revision, actorRevision: actor.revision, draft: account ? { ...account, memberships: account.memberships.map((entry) => ({ ...entry, groupIds: [...entry.groupIds] })) } : { name: "", login: "", role: "student", memberships: [] } });
  });
  const updateDraft = (patch: Partial<AccountDraft>) => setEditor((previous) => previous ? { ...previous, draft: { ...previous.draft, ...patch } } : previous);
  const changeType = (nextRole: string) => updateDraft({ role: nextRole as UserRole, memberships: [] });
  const save = async () => {
    if (!editor || busy) return;
    setBusy(true); setError("");
    try {
      const command = { actorId: currentUser.id, actorRevision: editor.actorRevision, expectedRevision: editor.revision };
      if (editor.account) await accountService.changeRole({ ...command, accountId: editor.account.id, accountRevision: editor.account.revision, role: editor.draft.role, memberships: editor.draft.memberships });
      else await accountService.create({ ...command, draft: editor.draft });
      setMessage(editor.account ? "Тип учётной записи изменён. История и ID сохранены." : "Учётная запись создана и доступна в демонстрационном переключателе.");
      setEditor(null); setConfirm(false);
    } catch (failure) { console.error("Не удалось сохранить учётную запись:", failure); setError(failure instanceof Error ? failure.message : "Не удалось сохранить учётную запись. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (editor?.account) setConfirm(true); else void save(); };
  return <div className={`pageContainer ${styles.page}`}>
    <div className={styles.toolbar}>
      <SearchField label="Поиск учётных записей" value={query} onChange={setQuery} placeholder="" />
      <Dropdown label="Тип учётной записи в списке" value={type} options={[{ value: "all", label: "Все типы" }, ...roleOptions]} onChange={setType} />
      <button type="button" className={styles.primary} disabled={Boolean(accountError || catalogError) || busy} onClick={() => openEditor()}>Создать учётную запись</button>
    </div>
    <p className={styles.note}>Демонстрационный режим: вход выбирается в меню кабинета. Пароли здесь не создаются и не хранятся.</p>
    {accountError && <p role="alert" className={styles.error}>{accountError}</p>}
    {catalogError && <p role="alert" className={styles.error}>{catalogError}</p>}
    {message && <p role="status" className={styles.message}>{message}</p>}
    {error && !confirm && <p role="alert" className={styles.error}>{error}</p>}
    {editor && <form className={styles.editor} onSubmit={submit} aria-label={editor.account ? "Изменение типа учётной записи" : "Новая учётная запись"}>
      <div className={styles.editorHeader}><h2>{editor.account ? `Изменить тип: ${editor.account.name}` : "Новая учётная запись"}</h2><button type="button" disabled={busy} onClick={() => requestAction(() => { setEditor(null); setError(""); })}>Закрыть</button></div>
      <fieldset disabled={busy || Boolean(accountError || catalogError)} className={styles.fields}>
        <label>Имя и фамилия<input required minLength={2} maxLength={120} value={editor.draft.name} readOnly={Boolean(editor.account)} onChange={(event) => updateDraft({ name: event.target.value })} autoComplete="off" /></label>
        <label>Логин<input required minLength={3} maxLength={64} value={editor.draft.login} readOnly={Boolean(editor.account)} onChange={(event) => updateDraft({ login: event.target.value })} autoComplete="off" autoCapitalize="none" spellCheck={false} /></label>
        <Dropdown label="Тип учётной записи" value={editor.draft.role} options={roleOptions} onChange={changeType} disabled={busy || Boolean(accountError || catalogError)} />
        {editor.draft.role === "student" && <Dropdown searchable label="Учебная группа студента" value={editor.draft.memberships[0]?.groupIds[0] ?? ""} options={ACADEMIC_GROUPS.map((group) => ({ value: group.id, label: group.name }))} onChange={(id) => updateDraft({ memberships: studentMemberships(id) })} disabled={busy || Boolean(accountError || catalogError)} />}
        {editor.draft.role === "teacher" && <p className={styles.assignmentNote}>{editor.account ? "Предметы и группы преподавателя назначаются в разделе " : "После создания учётной записи назначьте предметы и группы в разделе "}<Link to="/admin/subjects">«Дисциплины»</Link>.</p>}
      </fieldset>
      <div className={styles.formActions}><button className={styles.primary} type="submit" disabled={busy || Boolean(accountError || catalogError) || Boolean(editor.account && editor.account.role === editor.draft.role)}>{busy ? "Сохраняем…" : editor.account ? "Изменить тип" : "Создать"}</button><span>{editor.account ? "Оценки, переписка и файлы сохраняют прежний ID владельца." : "Логин должен быть уникальным; регистр не учитывается."}</span></div>
    </form>}
    <div className={styles.listHeading}><span>Учётные записи</span><span>{visible.length} из {accounts.length}</span></div>
    <div className={styles.list}>{visible.map((account) => <article className={styles.card} key={account.id}><div className={styles.identity}><strong>{account.name}{account.id === currentUser.id && <small>Вы</small>}</strong><span>{account.login}</span></div><div className={styles.details}><span className={styles.role}>{ACCOUNT_ROLE_LABELS[account.role]}</span>{account.role === "student" && <span>{getAcademicGroup(account.memberships[0]?.groupIds[0])?.name}</span>}{account.role === "teacher" && <span>{account.memberships.map((entry) => getAcademicSubjectDefinition(entry.subjectId)?.shortName).join(" · ")}</span>}</div><button type="button" disabled={busy || Boolean(accountError)} onClick={() => openEditor(account)} aria-label={`Изменить тип: ${account.name}`}>Изменить тип</button></article>)}</div>
    {!visible.length && !accountError && <div className={styles.empty}>Учётные записи не найдены.</div>}
    {confirm && editor?.account && <ConfirmDialog title="Изменить тип учётной записи?" confirmLabel="Изменить тип" busy={busy} error={error} onCancel={() => { setConfirm(false); setError(""); }} onConfirm={() => void save()}><p>{editor.account.name}: {ACCOUNT_ROLE_LABELS[editor.account.role]} → {ACCOUNT_ROLE_LABELS[editor.draft.role]}.</p><p>Доступ изменится сразу, включая открытые вкладки. ID и история сохранятся.</p></ConfirmDialog>}
  </div>;
};
export default AdminAccountsPage;
