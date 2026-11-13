import { useEffect, useMemo, useRef, useState } from "react";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { changesAdminSubject } from "../../domain/unsavedNavigation";
import { isAccountActive } from "../../domain/accounts";
import { isSubjectActive, type SubjectDefinition, type SubjectTargetCommand } from "../../domain/subjectCatalog";
import { readAccountsState } from "../../data/accountStore";
import { readSubjectCatalogState, subjectCatalogService, type SubjectStatusPreview } from "../../data/subjectCatalogStore";
import RecordEditor from "../../components/RecordEditor";
import ConfirmDialog from "../../components/ConfirmDialog";
import SubjectCreationForm from "./SubjectCreationForm";
import SubjectHistory from "./SubjectHistory";
import styles from "./index.module.scss";

export default function SubjectManagement({ subject, revision, disabled, onDirtyChange, onSaved }: { subject: SubjectDefinition; revision: number; disabled: boolean; onDirtyChange(value: boolean): void; onSaved(): void }) {
  const { currentUser, accounts } = useRole(), { requestAction } = useUnsavedChangesGuard();
  const actorRevision = accounts.find(row => row.id === currentUser.id)?.revision ?? -1;
  const [editor, setEditor] = useState<{ base: SubjectTargetCommand; name: string; shortName: string } | null>(null);
  const [preview, setPreview] = useState<SubjectStatusPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const form = useRef<HTMLFormElement>(null), pending = useRef(false), generation = useRef(0), trigger = useRef<HTMLButtonElement>(null);
  const dirty = Boolean(editor && (editor.name !== subject.name || editor.shortName !== subject.shortName));
  useUnsavedChangesWarning(dirty || busy, changesAdminSubject);
  useEffect(() => { onDirtyChange(dirty || busy); return () => onDirtyChange(false); }, [dirty, busy, onDirtyChange]);
  useEffect(() => () => { generation.current++; }, []);
  const capture = (): SubjectTargetCommand => {
    const catalog = readSubjectCatalogState(), accounts = readAccountsState(), actor = accounts.accounts.find(row => row.id === currentUser.id), target = catalog.subjects.find(row => row.id === subject.id);
    if (catalog.error || accounts.error || !target || !actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error(catalog.error || accounts.error || "Дисциплина или учётная запись недоступна. Обновите данные.");
    return { actorId: actor.id, actorRevision: actor.revision, expectedRevision: catalog.revision, subjectId: target.id, subjectRevision: target.revision ?? 0 };
  };
  const command = useMemo(() => ({ actorId: currentUser.id, actorRevision, expectedRevision: revision, subjectId: subject.id, subjectRevision: subject.revision ?? 0 }), [currentUser.id, actorRevision, revision, subject.id, subject.revision]);
  const stale = Boolean(editor && (editor.base.actorId !== currentUser.id || editor.base.actorRevision !== actorRevision || editor.base.expectedRevision !== revision || !isAccountActive(currentUser)));
  const close = () => requestAction(() => { setEditor(null); setError(""); requestAnimationFrame(() => trigger.current?.focus()); });
  const openEdit = () => requestAction(() => { try { const base = capture(), latest = readSubjectCatalogState().subjects.find(row => row.id === base.subjectId)!; setEditor({ base, name: latest.name, shortName: latest.shortName }); setError(""); setMessage(""); } catch (failure) { console.error("Не удалось открыть дисциплину:", failure); setError(failure instanceof Error ? failure.message : "Не удалось открыть форму."); } });
  const run = async (action: () => Promise<void>) => {
    if (pending.current || disabled) return; const token = generation.current; pending.current = true; setBusy(true); setError("");
    try { await action(); }
    catch (failure) { if (generation.current === token) { console.error("Не удалось изменить дисциплину:", failure); setError(failure instanceof Error ? failure.message : "Не удалось сохранить изменение. Ввод сохранён."); } }
    finally { pending.current = false; if (generation.current === token) setBusy(false); }
  };
  const checkStatus = () => void run(async () => { const token = generation.current, result = await subjectCatalogService.previewStatus(capture()); if (generation.current === token) { setPreview(result); setMessage(""); } });
  const save = () => void run(async () => {
    if (!editor || stale) return; const token = generation.current;
    await subjectCatalogService.update({ ...editor.base, draft: { name: editor.name, shortName: editor.shortName } });
    if (generation.current === token) { setEditor(null); setMessage("Реквизиты дисциплины сохранены."); onSaved(); }
  });
  return <section aria-label="Реквизиты и состояние дисциплины">
    {!editor && <div className={styles.formActions}><button ref={trigger} type="button" disabled={disabled || busy || !isSubjectActive(subject)} onClick={openEdit}>Изменить реквизиты</button><button type="button" disabled={disabled || busy} onClick={checkStatus}>{isSubjectActive(subject) ? "Архивировать" : "Восстановить из архива"}</button></div>}
    {!isSubjectActive(subject) && <p className={styles.note}>Дисциплина в архиве. История, материалы и опубликованные результаты сохранены.</p>}
    {message && <p role="status">{message}</p>}{error && !preview && <p className={styles.error} role="alert">{error}</p>}
    {editor && <RecordEditor title="Реквизиты дисциплины" context={subject.name} dirty={dirty} busy={busy} onClose={close}>
      {stale && <p role="alert">Каталог или права изменились. <button type="button" disabled={busy} onClick={() => { try { const base = capture(); if (base.actorId !== editor.base.actorId || base.subjectRevision !== editor.base.subjectRevision) throw new Error("Эта дисциплина изменена. Текущий ввод сохранён; закройте форму и откройте актуальные реквизиты."); setEditor({ ...editor, base }); setError(""); } catch (failure) { console.error("Не удалось обновить проверку дисциплины:", failure); setError(failure instanceof Error ? failure.message : "Не удалось обновить проверку."); } }}>Обновить проверку</button></p>}
      <SubjectCreationForm editing draft={editor} formRef={form} subjects={readSubjectCatalogState().subjects.filter(row => row.id !== subject.id)} disabled={disabled} stale={stale} busy={busy} onChange={draft => setEditor({ ...editor, ...draft })} onSubmit={event => { event.preventDefault(); save(); }} onCancel={close} />
    </RecordEditor>}
    {!editor && <SubjectHistory command={command} />}
    {preview && <ConfirmDialog title={isSubjectActive(subject) ? "Архивировать дисциплину?" : "Восстановить дисциплину?"} confirmLabel={isSubjectActive(subject) ? "Архивировать" : "Восстановить"} confirmDisabled={disabled || preview.expectedRevision !== revision || isSubjectActive(subject) && preview.blockers.length > 0} busy={busy} error={error} onCancel={() => { if (!busy) { setPreview(null); setError(""); } }} onConfirm={() => void run(async () => { const token = generation.current; await subjectCatalogService.changeStatus({ ...preview, status: isSubjectActive(subject) ? "archived" : "active" }); if (generation.current === token) { setPreview(null); setMessage("Состояние дисциплины изменено."); onSaved(); } })}>
      <p>{subject.name}</p><p>Назначений преподавателей: {preview.dependencies.teachingAssignments}. Пар в черновиках: {preview.dependencies.draftLessons}. Будущих пар: {preview.dependencies.futurePublishedLessons}. Незавершённых аттестаций: {preview.dependencies.unfinishedAssessments}.</p>
      {isSubjectActive(subject) && preview.blockers.map(blocker => <p key={blocker}>{blocker}</p>)}<p>Дисциплина не удаляется. ID, история, прошедшие занятия, ведомости и материалы сохранятся.</p><button type="button" disabled={busy} onClick={checkStatus}>Проверить зависимости заново</button>
    </ConfirmDialog>}
  </section>;
}
