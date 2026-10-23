import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAcademicGroup, getSubjectGroups } from "../../data/academicCatalog";
import { accountService, readAccountsState } from "../../data/accountStore";
import { readSubjectCatalogState, subjectCatalogService } from "../../data/subjectCatalogStore";
import { replaceSubjectTeachingGroups, type PortalAccount } from "../../domain/accounts";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useSubjectCatalog } from "../../hooks/useSubjectCatalog";
import Dropdown from "../../components/Dropdown";
import SearchMultiSelect from "../../components/SearchMultiSelect";
import ConfirmDialog from "../../components/ConfirmDialog";
import styles from "./index.module.scss";

type AssignmentEditor = { subjectId: string; account: PortalAccount; groups: string[]; revision: number; actorRevision: number };
type SubjectEditor = { name: string; shortName: string; revision: number; actorRevision: number };

const AdminSubjectsPage = () => {
  const { currentUser, accounts, accountError, role } = useRole();
  const { subjects, error: catalogError } = useSubjectCatalog();
  const { requestAction } = useUnsavedChangesGuard();
  const [params, setParams] = useSearchParams();
  const subjectId = params.get("subject");
  const subject = subjects.find((item) => item.id === subjectId);
  const [formOpen, setFormOpen] = useState(false);
  const [editorState, setEditor] = useState<AssignmentEditor | null>(null);
  const [subjectEditor, setSubjectEditor] = useState<SubjectEditor | null>(null);
  const [createdSubjectId, setCreatedSubjectId] = useState<string | null>(null);
  const editor = editorState?.subjectId === subjectId ? editorState : null;
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const teachers = useMemo(() => accounts.filter((account) => account.role === "teacher"), [accounts]);
  const assignedTeachers = teachers.filter((account) => account.memberships.some((entry) => entry.subjectId === subject?.id && entry.groupIds.length));
  const assignedGroups = new Set(assignedTeachers.flatMap((account) => account.memberships.find((entry) => entry.subjectId === subject?.id)?.groupIds ?? []));
  const groupOptions = subject ? getSubjectGroups(subject.id).map((group) => ({ value: group.id, label: group.name })) : [];
  const previousGroups = editor?.account.memberships.find((entry) => entry.subjectId === editor.subjectId)?.groupIds ?? [];
  const dirty = Boolean(editor && (editor.groups.length !== previousGroups.length || editor.groups.some((id) => !previousGroups.includes(id))));
  const removedGroups = previousGroups.filter((id) => !editor?.groups.includes(id));
  const subjectDirty = Boolean(subjectEditor && (subjectEditor.name.trim() || subjectEditor.shortName.trim()));
  const unavailable = Boolean(accountError || catalogError);
  useUnsavedChangesWarning(dirty || subjectDirty || busy);
  useEffect(() => { setEditor(null); setFormOpen(false); setConfirm(false); setError(""); }, [subjectId]);
  useEffect(() => {
    if (!createdSubjectId || subjectEditor || busy) return;
    // Navigate only after the saved form has released its unsaved-changes guard.
    setParams((previous) => { const next = new URLSearchParams(previous); next.set("subject", createdSubjectId); return next; });
    setCreatedSubjectId(null);
  }, [createdSubjectId, subjectEditor, busy, setParams]);

  const selectSubject = (id: string) => {
    if (id === subject?.id || busy) return;
    requestAction(() => {
      setEditor(null); setSubjectEditor(null); setFormOpen(false); setError(""); setMessage(""); setConfirm(false);
      setParams((previous) => { const next = new URLSearchParams(previous); next.set("subject", id); return next; });
    });
  };
  const editTeacher = (id: string) => {
    if (!subject || busy) return;
    requestAction(() => {
    const snapshot = readAccountsState();
    const account = snapshot.accounts.find((entry) => entry.id === id && entry.role === "teacher");
    const actor = snapshot.accounts.find((entry) => entry.id === currentUser.id);
    if (snapshot.error || !account || !actor) { setError(snapshot.error || "Учётная запись изменилась. Обновите список преподавателей."); return; }
    setEditor({ subjectId: subject.id, account, groups: [...(account.memberships.find((entry) => entry.subjectId === subject.id)?.groupIds ?? [])], revision: snapshot.revision, actorRevision: actor.revision });
    setSubjectEditor(null); setFormOpen(true); setError(""); setMessage(""); setConfirm(false);
    });
  };
  const openNew = () => requestAction(() => { setEditor(null); setSubjectEditor(null); setFormOpen(true); setError(""); setMessage(""); });
  const closeEditor = () => requestAction(() => { setEditor(null); setSubjectEditor(null); setFormOpen(false); setError(""); setConfirm(false); });
  const openSubjectCreation = () => requestAction(() => {
    const snapshot = readSubjectCatalogState();
    const accountSnapshot = readAccountsState();
    const actor = accountSnapshot.accounts.find((entry) => entry.id === currentUser.id);
    if (snapshot.error || accountSnapshot.error || !actor) { setError(snapshot.error || accountSnapshot.error || "Учётная запись изменилась. Обновите страницу."); return; }
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

  if (role !== "configurator") return <div className={styles.empty}>Управление дисциплинами доступно настройщику.</div>;
  return <div className={`pageContainer ${styles.page}`}>
    <div className={styles.catalog}>
      <Dropdown label="Поиск дисциплины" placeholder="" searchable value={subject?.id ?? ""} options={subjects.map((item) => ({ value: item.id, label: item.name }))} onChange={selectSubject} disabled={busy || Boolean(catalogError)} />
      <button type="button" className={styles.primary} disabled={busy || unavailable} onClick={openSubjectCreation}>Создать дисциплину</button>
    </div>
    {accountError && <p className={styles.error} role="alert">{accountError}</p>}
    {catalogError && <p className={styles.error} role="alert">{catalogError}</p>}
    {error && !confirm && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {subjectEditor && <form className={styles.editor} aria-label="Новая дисциплина" onSubmit={(event) => void createSubject(event)}>
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
      {formOpen && <form className={styles.editor} aria-label="Назначение преподавателя на дисциплину" onSubmit={submit}>
        <div className={styles.editorHeader}><h3>Преподаватель и группы</h3><button type="button" disabled={busy} onClick={closeEditor}>Закрыть</button></div>
        <Dropdown label="Преподаватель дисциплины" searchable value={editor?.account.id ?? ""} options={teachers.map((account) => ({ value: account.id, label: `${account.name} · ${account.login}` }))} onChange={editTeacher} disabled={busy || unavailable} placeholder="" />
        {editor ? <>
          <SearchMultiSelect key={editor.account.id} label="Поиск учебных групп" options={groupOptions} value={editor.groups} onChange={(groups) => setEditor((previous) => previous ? { ...previous, groups } : previous)} disabled={busy || unavailable} />
          <p className={styles.note}>Назначения по другим дисциплинам сохранятся. Пустой выбор снимает назначение по этой дисциплине.</p>
          <div className={styles.formActions}><button className={styles.primary} type="submit" disabled={busy || !dirty || unavailable}>{busy ? "Сохраняем…" : !editor.groups.length && previousGroups.length ? "Снять назначение" : "Сохранить назначения"}</button></div>
        </> : <p className={styles.note}>Выберите преподавателя, затем найдите его учебные группы.</p>}
      </form>}
      <div className={styles.list}>{assignedTeachers.map((account) => {
        const groups = account.memberships.find((entry) => entry.subjectId === subject.id)?.groupIds ?? [];
        return <article key={account.id} className={styles.teacher}><div className={styles.teacherHeader}><div><strong>{account.name}</strong><span>{account.login}</span></div><button type="button" disabled={busy || unavailable} aria-label={`Изменить группы: ${account.name}`} onClick={() => editTeacher(account.id)}>Изменить группы</button></div><div className={styles.tags}>{groups.slice(0, 5).map((id) => <span key={id}>{getAcademicGroup(id)?.name ?? id}</span>)}{groups.length > 5 && <span>Ещё групп: {groups.length - 5}</span>}</div></article>;
      })}</div>
      {!assignedTeachers.length && !unavailable && <div className={styles.empty}>{teachers.length ? <>Преподаватели пока не назначены.<br />Выберите преподавателя и его группы.</> : <>Сначала создайте учётную запись преподавателя в разделе <Link to="/admin/accounts">«Учётные записи»</Link>.</>}</div>}
    </section> : !subjectEditor && !catalogError && <div className={styles.empty}><strong>{subjectId ? "Дисциплина не найдена" : "Выберите дисциплину"}</strong><p>{subjectId ? "Найдите другую дисциплину через поиск или создайте новую." : "Найдите дисциплину по названию, чтобы назначить преподавателей и группы. Новую дисциплину можно создать кнопкой выше."}</p></div>}
    {confirm && editor && subject && <ConfirmDialog title="Изменить группы преподавателя?" confirmLabel={editor.groups.length ? "Сохранить назначения" : "Снять назначение"} busy={busy} error={error} onCancel={() => { setConfirm(false); setError(""); }} onConfirm={() => void save()}><p>{editor.account.name} · {subject.name}</p><p>Снимаются группы: {removedGroups.map((id) => getAcademicGroup(id)?.name ?? id).join(", ")}.</p><p>Доступ к этим группам обновится сразу.</p></ConfirmDialog>}
  </div>;
};
export default AdminSubjectsPage;
