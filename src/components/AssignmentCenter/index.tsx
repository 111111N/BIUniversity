import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Assignment } from "../../data/assignmentStore";
import { getAssignmentVisibility } from "../../domain/assignmentForm";
import { getAssignmentAttachmentName } from "../../domain/assignmentAttachments";
import { indexAssignmentSubmissions, studentAssignmentViews, teacherAssignmentViews, type AssignmentSort, type AssignmentView } from "../../domain/assignmentViews";
import AssignmentList from "./AssignmentList";
import AssignmentHeader from "./AssignmentHeader";
import AssignmentIcon from "./AssignmentIcon";
import AssignmentEditor from "./AssignmentEditor";
import AssignmentPreview from "./AssignmentPreview";
import SubmissionWorkspace from "./SubmissionWorkspace";
import StudentAssignmentWorkspace from "./StudentAssignmentWorkspace";
import ConfirmDialog from "../ConfirmDialog";
import AssignmentFile from "./AssignmentFile";
import { useAssignmentController } from "./useAssignmentController";
import { restoreAssignmentListFocus, type AssignmentListPosition } from "./listFocus";
import { changeAssignmentWorkView, changeSubmissionReviewView, clearSubmissionReviewView, isAssignmentWorkView, readSubmissionReviewView, type SubmissionReviewView } from "../../domain/submissionReviewNavigation";
import styles from "./index.module.scss";

export default function AssignmentCenter({ subject, group }: { subject?: string; group?: string }) {
  const c = useAssignmentController({ subject, group });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  const indexes = useMemo(() => indexAssignmentSubmissions(c.submissions, c.student.id), [c.submissions, c.student.id]);
  const views = c.role === "teacher" ? teacherAssignmentViews : studentAssignmentViews;
  const rawView = c.searchParams.get("tasks");
  const view: AssignmentView = views.find((option) => option.value === rawView)?.value ?? (c.role === "teacher" ? "current" : "todo");
  const query = c.searchParams.get("taskSearch") ?? "";
  const rawSort = c.searchParams.get("taskSort");
  const sort: AssignmentSort = rawSort === "newest" || rawSort === "title" ? rawSort : "deadline";
  const selected = c.visible.find((item) => item.id === c.expanded);
  const editingRecord = c.editingSnapshot?.id === c.editingId ? c.editingSnapshot : c.assignments.find((item) => item.id === c.editingId);
  const retainedAttachmentName = getAssignmentAttachmentName(editingRecord);
  const editorUnavailableReason = c.storageError || (c.editingId && editingRecord && !selected ? "Задание больше недоступно. Возможно, оно удалено в другой вкладке." : "");
  const work = c.role === "teacher" && isAssignmentWorkView(c.searchParams);
  const reviewView = readSubmissionReviewView(c.searchParams);
  const updateReviewView = (values: Partial<SubmissionReviewView>) => c.setSearchParams((current) => changeSubmissionReviewView(current, values), { replace: true });
  const answers = selected ? indexes.byAssignment.get(selected.id) ?? [] : [];
  const selectedSubmissionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);
  const listPosition = useRef<AssignmentListPosition | null>(null);
  const wasAssignmentOpen = useRef(false);
  const detailVisible = Boolean((c.creating && (!c.editingId || editingRecord)) || selected);
  const busy = c.saving || Boolean(c.storageError);
  const updateList = (key: string, value: string) => c.setSearchParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });
  const open = (assignment: Assignment, review = false) => {
    listPosition.current = { top: window.scrollY, id: assignment.id };
    if (c.role === "teacher" && assignment.status === "draft") { c.editAssignment(assignment); return; }
    c.setSearchParams((current) => {
      const next = clearSubmissionReviewView(current);
      next.set("tab", "assignments"); next.set("assignment", assignment.id);
      next.delete("editor"); next.delete("publish"); next.delete("submission");
      if (review) next.set("assignmentTab", "work"); else next.delete("assignmentTab");
      return next;
    });
  };
  const startAssignment = () => {
    listPosition.current = { top: window.scrollY, id: null };
    c.startAssignment();
  };
  const showWork = (value: boolean) => {
    c.setSearchParams((current) => changeAssignmentWorkView(current, value));
  };
  const closePreview = () => {
    c.setPreviewing(false);
    if (editorUnavailableReason) requestAnimationFrame(() => c.titleRef.current?.focus());
  };
  useLayoutEffect(() => {
    const returningToList = wasAssignmentOpen.current && !detailVisible;
    wasAssignmentOpen.current = detailVisible || Boolean(c.requestedAssignment);
    const frame = requestAnimationFrame(() => {
      if (detailVisible) headingRef.current?.focus({ preventScroll: false });
      else if (returningToList) {
        if (listRef.current) restoreAssignmentListFocus(listRef.current, listPosition.current);
        else errorHeadingRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [c.creating, c.expanded, c.requestedAssignment, detailVisible]);

  if (c.role === "configurator") return null;
  if (c.storageError && !c.creating && !selected) return <section className={styles.error} role="alert"><h2 ref={errorHeadingRef} tabIndex={-1}>Задания временно недоступны</h2><p>{c.storageError}</p><button type="button" onClick={c.reload}>Повторить загрузку</button></section>;

  return <div className={styles.layout} data-assignment-center>
    {c.storageError && <div className={styles.error} role="alert"><p>{c.storageError}</p><button type="button" onClick={c.reload}>Повторить загрузку</button></div>}
    {c.operationError && <p className={styles.error} role="alert">{c.operationError}</p>}
    {!c.operationError && c.operationMessage && <p className={styles.notice} role="status">{c.operationMessage}</p>}
    {c.creating && (!c.editingId || editingRecord) ? <AssignmentEditor form={c.form} onChange={c.setForm} onSubmit={c.create} onSaveDraft={() => { void c.saveAssignment("draft"); }} onCancel={c.closeEditor} editing={Boolean(c.editingId)} originalStatus={editingRecord?.status} saving={c.saving} unavailableReason={editorUnavailableReason} dirty={c.formDirty} error={c.formError} file={c.taskFile} retainedAttachmentName={retainedAttachmentName} onFileChange={c.setTaskFile} subjectLocked={Boolean(subject)} groupLocked={Boolean(group)} formRef={c.formRef} titleRef={c.titleRef} errorRef={c.formErrorRef} /> : selected ? <>
      <AssignmentHeader assignment={selected} teacher={c.role === "teacher"} saving={busy} work={work} titleRef={headingRef}
        onBack={() => c.setExpanded(null)} onPublish={() => c.publishDraft(selected)} onEdit={() => c.editAssignment(selected)}
        onDelete={() => { c.setDeleteError(""); c.setPendingDelete(selected); }} />
      {c.role === "teacher" ? <>
        <div className={styles.detailNavigation}>
          <div className={styles.segments} role="group" aria-label="Разделы задания"><button type="button" aria-pressed={!work} onClick={() => showWork(false)}>Условие</button><button type="button" aria-pressed={work} onClick={() => showWork(true)}>Работы<span>{answers.length}</span></button></div>
          {work && <details className={styles.conditionPeek}><summary>Условие задания</summary><p>{selected.description}</p><AssignmentFile attachment={selected} /></details>}
        </div>
        {work ? <><SubmissionWorkspace key={selected.id} answers={answers} students={c.journal.students} groupId={selected.groupId} rosterError={c.journal.error} currentId={c.requestedSubmission} targetRef={selectedSubmissionRef} saving={c.saving} unavailableReason={c.storageError} drafts={c.reviewDrafts} onDraftChange={c.updateReviewDraft} onSelect={c.selectSubmission} onReview={c.review} view={reviewView} onViewChange={updateReviewView} /></> : <section className={styles.condition} aria-label="Условие задания"><div className={styles.conditionBody}><h3>Что нужно сделать</h3><p>{selected.description}</p>{selected.attachmentId && <div className={styles.attachment}><span>Файл задания</span><AssignmentFile attachment={selected} /></div>}</div><aside className={styles.parameters}><h3>Параметры приёма</h3><p>{getAssignmentVisibility(selected.status)}</p><dl><div><dt>Ответы после срока</dt><dd>{selected.allowLateSubmissions ? "Разрешены при открытом приёме" : "Не принимаются"}</dd></div><div><dt>Получено работ</dt><dd>{answers.length}</dd></div></dl><button type="button" className={styles.primary} onClick={() => showWork(true)}>{(indexes.pending.get(selected.id) ?? 0) > 0 ? `Проверить работы · ${indexes.pending.get(selected.id)}` : "Открыть работы студентов"}<AssignmentIcon name="arrowRight" /></button></aside></section>}
      </> : <StudentAssignmentWorkspace key={c.student.id + selected.id} assignment={selected} submission={indexes.mine.get(selected.id)} studentId={c.student.id} saving={c.saving} unavailableReason={c.storageError} onSend={(text, file) => c.sendAnswer(selected, text, file)} />}
    </> : <>
      {c.requestedAssignment && <div className={styles.unavailable} role="status"><h3>Задание недоступно</h3><p>Возможно, оно удалено, ещё не опубликовано или относится к другой группе.</p><button type="button" onClick={() => c.setExpanded(null)}>К доступным заданиям</button></div>}
      <AssignmentList listRef={listRef} assignments={c.visible} indexes={indexes} role={c.role} view={view} query={query} sort={sort} now={now} showContext={!subject || !group} onView={(value) => updateList("tasks", value)} onQuery={(value) => updateList("taskSearch", value)} onSort={(value) => updateList("taskSort", value)} onOpen={open} onCreate={startAssignment} />
    </>}
    {c.pendingDelete && <ConfirmDialog title="Удалить задание?" busy={c.saving} error={c.deleteError} onCancel={() => c.setPendingDelete(null)} onConfirm={() => { void c.deleteAssignment(c.pendingDelete!); }}><p><strong>{c.pendingDelete.title}</strong></p><p>Будут удалены задание, ответы студентов ({(indexes.byAssignment.get(c.pendingDelete.id) ?? []).length}) и вложения всех попыток. Восстановить их нельзя.</p></ConfirmDialog>}
    {c.previewing && c.creating && (!c.editingId || editingRecord) && <AssignmentPreview form={c.form} publishing={c.form.status === "published" && c.assignments.find((item) => item.id === c.editingId)?.status !== "published"} attachmentName={c.taskFile?.name ?? retainedAttachmentName} attachmentSize={c.taskFile?.size} saving={c.saving} unavailableReason={editorUnavailableReason} error={c.formError} onBack={closePreview} onSave={() => { void c.saveAssignment(); }} />}
  </div>;
}
