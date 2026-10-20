import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Assignment,
  AssignmentStatus,
  deleteAssignmentFile,
  downloadAssignmentFile,
  getAssignments,
  getSubmissions,
  removeAssignmentRecords,
  LessonType,
  saveAssignmentFile,
  saveAssignments,
  saveSubmissions,
  subscribeAssignmentStore,
  Submission,
  SubmissionAttempt,
} from "../../data/assignmentStore";
import {
  getAssignmentDeadlineState,
  getCurrentSubmissionAttempt,
  getStudentAssignmentState,
  getSubmissionAttempts,
  getSubmissionStatus,
  isAssignmentVisibleToStudent,
  isAttemptLate,
  isSubmissionAllowed,
} from "../../domain/assignments";
import { addNotification } from "../../data/notificationStore";
import { ACADEMIC_GROUPS, ACADEMIC_SUBJECTS, getAcademicGroup, getAcademicGroupByName, getAcademicSubjectByName, getSubjectGroups } from "../../data/academicCatalog";
import { getAssignmentHref } from "../../domain/journalNavigation";
import ArrowCircle from "../ArrowCircle";
import AssignmentProgress from "../AssignmentProgress";
import DateTimePicker from "../DateTimePicker";
import Dropdown from "../Dropdown";
import { useRole } from "../RoleContext";
import AttemptHistory from "./AttemptHistory";
import SubmissionWorkspace from "./SubmissionWorkspace";
import AnswerComposer from "./AnswerComposer";
import SearchField from "../SearchField";
import { matchesSearchText } from "../../domain/search";
import type { ReviewDraft } from "../../domain/submissionReview";
import { getAssignmentFormError, getAssignmentVisibility } from "../../domain/assignmentForm";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import AssignmentPreview from "./AssignmentPreview";
import AttachmentPicker from "../AttachmentPicker";
import DownloadButton from "../DownloadButton";
import ConfirmDialog from "../ConfirmDialog";
import Checkbox from "../Checkbox";
import { useJournal } from "../../data/journalStore";
import styles from "./index.module.scss";

const DEMO_STUDENT_GROUP = "112-МКо";
const DEMO_STUDENT_ID = "anna-smirnova";
const DEMO_TEACHER_ID = "teacher-elena-volkova";
const SUBJECTS = ACADEMIC_SUBJECTS.map((item) => item.name);
const GROUPS = ACADEMIC_GROUPS.map((item) => item.name);
const STATUS_LABELS: Record<AssignmentStatus, string> = { draft: "Черновик", published: "Опубликовано", closed: "Завершено", archived: "Архив" };
class AnswerSendError extends Error {}
class AssignmentSaveError extends Error {}
const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const createDefaultForm = (subject?: string, group?: string) => {
  const lesson = new Date();
  lesson.setDate(lesson.getDate() + 1);
  lesson.setHours(9, 0, 0, 0);
  const deadline = new Date(lesson);
  deadline.setDate(deadline.getDate() + 3);
  deadline.setHours(23, 59, 0, 0);
  return { subject: subject ?? SUBJECTS[0], group: group ?? GROUPS[0], lessonDate: localDateTime(lesson), lessonType: "Практика" as LessonType, title: "", description: "", deadline: localDateTime(deadline), status: "published" as AssignmentStatus, allowLateSubmissions: false };
};

interface Props { subject?: string; group?: string }
type AssignmentFilter = "all" | AssignmentStatus;

const AssignmentCenter = ({ subject, group }: Props) => {
  const { role, currentUser } = useRole();
  const membership = currentUser.memberships.find((item) => item.subjectId === getAcademicSubjectByName(subject)?.id);
  const membershipGroup = getAcademicGroup(membership?.groupIds[0])?.name ?? DEMO_STUDENT_GROUP;
  const student = { id: currentUser.role === "student" ? currentUser.id : DEMO_STUDENT_ID, name: currentUser.role === "student" ? currentUser.name : "Анна Смирнова", group: group ?? membershipGroup };
  const [assignments, setAssignments] = useState(getAssignments);
  const [submissions, setSubmissions] = useState(getSubmissions);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedAssignment = searchParams.get("assignment");
  const requestedSubmission = role === "teacher" ? searchParams.get("submission") : null;
  const selectedAssignmentRef = useRef<HTMLElement>(null);
  const selectedSubmissionRef = useRef<HTMLDivElement>(null);
  const componentId = useId();
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [taskFile, setTaskFile] = useState<File | null>(null);
  const answerSendLock = useRef(false);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const updateReviewDraft = (attemptId: string, values: Partial<ReviewDraft>) => setReviewDrafts((current) => ({ ...current, [attemptId]: { ...(current[attemptId] ?? { comment: "", grade: "" }), ...values } }));
  const [operationError, setOperationError] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Assignment | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [form, setForm] = useState(() => createDefaultForm(subject, group));
  const [originalForm, setOriginalForm] = useState(form);
  const [formError, setFormError] = useState("");
  const editingVersionRef = useRef<string | null>(null);
  const assignmentSaveLock = useRef(false);
  const [pendingFormAction, setPendingFormAction] = useState<(() => void) | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const formDirty = creating && (JSON.stringify(form) !== JSON.stringify(originalForm) || Boolean(taskFile));
  const hasReviewDraft = role === "teacher" && submissions.some((submission) => {
    const attempt = getCurrentSubmissionAttempt(submission);
    const draft = reviewDrafts[attempt?.id ?? submission.id];
    return attempt?.status === "submitted" && Boolean(draft?.comment.trim() || draft?.grade);
  });
  useUnsavedChangesWarning(formDirty || hasReviewDraft);
  const journal = useJournal(getAcademicSubjectByName(subject)?.id ?? "", getAcademicGroupByName(group)?.id ?? "");
  const formSubjectId = getAcademicSubjectByName(form.subject)?.id;
  const availableGroups = formSubjectId ? getSubjectGroups(formSubjectId) : ACADEMIC_GROUPS;

  useEffect(() => subscribeAssignmentStore(() => {
    setAssignments(getAssignments());
    setSubmissions(getSubmissions());
  }), []);

  const mine = useMemo(() => submissions.filter((item) => item.studentId === student.id), [submissions, student.id]);
  const visible = assignments
    .filter((item) => currentUser.memberships.some((membership) => membership.subjectId === item.subjectId && membership.groupIds.includes(item.groupId)) && (role === "teacher" || isAssignmentVisibleToStudent(item, student.group)) && (!subject || item.subject === subject) && (!group || item.group === group))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const visibleIds = new Set(visible.map((item) => item.id));
  const expanded = requestedAssignment && visibleIds.has(requestedAssignment) ? requestedAssignment : null;
  const setExpanded = (id: string | null) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    if (id) { next.set("assignment", id); next.set("tab", "assignments"); }
    else next.delete("assignment");
    next.delete("submission");
    return next;
  }, { replace: true });

  useEffect(() => {
    setAssignmentFilter("all");
  }, [requestedAssignment]);

  useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(() => {
      const target = selectedSubmissionRef.current ?? selectedAssignmentRef.current;
      target?.scrollIntoView({ block: "start", behavior: "auto" });
      if (selectedSubmissionRef.current) selectedSubmissionRef.current.focus({ preventScroll: true });
      else target?.querySelector<HTMLButtonElement>('[data-assignment-toggle="true"]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, requestedSubmission]);
  const displayedAssignments = visible.filter((item) => (assignmentFilter === "all" || item.status === assignmentFilter) && matchesSearchText(`${item.title} ${item.description} ${item.subject} ${item.group}`, assignmentQuery));
  const resetAssignmentFilters = () => {
    setAssignmentQuery("");
    setAssignmentFilter("all");
    requestAnimationFrame(() => {
      selectedAssignmentRef.current?.querySelector<HTMLButtonElement>('[data-assignment-toggle="true"]')?.focus({ preventScroll: true });
    });
  };
  const selectSubmission = (id: string) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set("submission", id);
    return next;
  }, { replace: true });
  const visibleAnswers = submissions.filter((item) => visibleIds.has(item.assignmentId));
  const awaitingReview = visibleAnswers.filter((item) => getSubmissionStatus(item) === "submitted").length;
  const checkedAnswers = visibleAnswers.filter((item) => getSubmissionStatus(item) === "graded").length;
  const revisions = visibleAnswers.filter((item) => getSubmissionStatus(item) === "revision").length;
  const studentActionRequired = visible.filter((item) => {
    const answer = mine.find((entry) => entry.assignmentId === item.id);
    return isSubmissionAllowed(item) && (!answer || getSubmissionStatus(answer) === "revision");
  }).length;
  const persistAssignments = (items: Assignment[]) => { saveAssignments(items); setAssignments(items); };
  const persistSubmissions = (items: Submission[]) => { saveSubmissions(items); setSubmissions(items); };

  const create = (event: FormEvent) => {
    event.preventDefault();
    const error = getAssignmentFormError(form, currentUser.memberships);
    setFormError(error);
    setOperationError("");
    setOperationMessage("");
    if (error) requestAnimationFrame(() => formErrorRef.current?.focus({ preventScroll: false }));
    if (!error && role === "teacher") setPreviewing(true);
  };

  const saveAssignment = async (status = form.status) => {
    if (saving || assignmentSaveLock.current || role !== "teacher") return;
    const targetForm = { ...form, status };
    const error = getAssignmentFormError(targetForm, currentUser.memberships);
    if (error) { setFormError(error); if (!previewing) requestAnimationFrame(() => formErrorRef.current?.focus()); return; }
    assignmentSaveLock.current = true;
    setFormError("");
    setOperationError("");
    setOperationMessage("");
    setSaving(true);
    let attachmentId: string | undefined;
    try {
    attachmentId = taskFile ? await saveAssignmentFile(taskFile) : undefined;
    const latestAssignments = getAssignments();
    const previous = editingId ? latestAssignments.find((item) => item.id === editingId) : undefined;
    if (editingId && !previous) throw new AssignmentSaveError("Задание уже удалено. Текст оставлен в форме: скопируйте его перед закрытием.");
    if (previous && previous.updatedAt !== editingVersionRef.current) throw new AssignmentSaveError("Задание изменилось в другой вкладке. Сохранение остановлено, чтобы не затереть изменения. Скопируйте свой текст и откройте актуальную версию.");
    const now = new Date().toISOString();
    const subjectName = subject ?? form.subject;
    const groupName = group ?? form.group;
    const item: Assignment = { id: editingId ?? crypto.randomUUID(), ...targetForm, title: form.title.trim(), description: form.description.trim(), subjectId: getAcademicSubjectByName(subjectName)?.id ?? "unknown-subject", groupId: getAcademicGroupByName(groupName)?.id ?? "unknown-group", subject: subjectName, group: groupName, attachmentId: attachmentId ?? previous?.attachmentId, attachmentName: taskFile?.name ?? previous?.attachmentName, createdAt: previous?.createdAt ?? now, updatedAt: now };
    persistAssignments(editingId ? latestAssignments.map((entry) => entry.id === editingId ? item : entry) : [item, ...latestAssignments]);
    if (attachmentId && previous?.attachmentId && previous.attachmentId !== attachmentId) void deleteAssignmentFile(previous.attachmentId).catch(() => {});
    if (item.status === "published" && previous?.status !== "published") {
      try { addNotification({ recipientUserId: DEMO_STUDENT_ID, kind: "assignment", title: item.title, body: `${item.subject} · срок до ${new Date(item.deadline).toLocaleString("ru-RU")}`, href: getAssignmentHref(item), dedupeKey: `assignment-published:${item.id}` }); } catch { /* Задание сохранено; сбой уведомления не должен откатывать его. */ }
    }
    setCreating(false);
    setPreviewing(false);
    setEditingId(null);
    setTaskFile(null);
    resetAssignmentFilters();
    setExpanded(item.id);
    setOperationMessage(editingId ? "Изменения задания сохранены." : item.status === "draft" ? "Черновик сохранён. Студенты увидят задание после публикации." : "Задание сохранено.");
    } catch (error) {
      if (attachmentId) void deleteAssignmentFile(attachmentId).catch(() => {});
      setFormError(error instanceof AssignmentSaveError ? error.message : "Не удалось сохранить задание. Проверьте доступ к хранилищу и повторите попытку.");
      if (!previewing) requestAnimationFrame(() => formErrorRef.current?.focus());
    } finally {
      setSaving(false);
      assignmentSaveLock.current = false;
    }
  };

  const focusEditor = () => requestAnimationFrame(() => {
    formRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    titleRef.current?.focus({ preventScroll: true });
  });
  const afterDiscard = (action: () => void) => {
    if (saving) return;
    if (formDirty) setPendingFormAction(() => action); else action();
  };
  const startAssignment = () => {
    if (creating) { focusEditor(); return; }
    const initial = createDefaultForm(subject, group);
    setForm(initial);
    setOriginalForm(initial);
    setFormError("");
    editingVersionRef.current = null;
    setEditingId(null);
    setTaskFile(null);
    setOperationError("");
    setOperationMessage("");
    setCreating(true);
    setPreviewing(false);
    focusEditor();
  };
  const closeEditor = () => afterDiscard(() => {
    setCreating(false);
    setPreviewing(false);
    setEditingId(null);
    setTaskFile(null);
    setFormError("");
    setOperationError("");
  });
  const editAssignment = (assignment: Assignment, publish = false) => {
    afterDiscard(() => {
      const initial = { subject: assignment.subject, group: assignment.group, lessonDate: assignment.lessonDate, lessonType: assignment.lessonType, title: assignment.title, description: assignment.description, deadline: assignment.deadline, status: assignment.status, allowLateSubmissions: assignment.allowLateSubmissions };
      setOriginalForm(initial);
      setFormError("");
      editingVersionRef.current = assignment.updatedAt;
      setForm(publish ? { ...initial, status: "published" } : initial);
      setEditingId(assignment.id);
      setTaskFile(null);
      setOperationError("");
      setOperationMessage("");
      setCreating(true);
      setPreviewing(publish);
      setExpanded(null);
      if (!publish) focusEditor();
    });
  };

  const publishDraft = (assignment: Assignment) => {
    if (saving || role !== "teacher" || assignment.status !== "draft" || !visibleIds.has(assignment.id)) return;
    editAssignment(assignment, true);
  };

  const deleteAssignment = async (assignment: Assignment) => {
    if (saving || role !== "teacher" || !visibleIds.has(assignment.id)) return;
    setOperationError("");
    setOperationMessage("");
    setDeleteError("");
    setSaving(true);
    try {
      const removed = removeAssignmentRecords(assignment.id);
      const fileIds = new Set([removed.assignment?.attachmentId, ...removed.submissions.flatMap((item) => getSubmissionAttempts(item).map((attempt) => attempt.attachmentId))].filter((id): id is string => Boolean(id)));
      const cleanup = await Promise.allSettled([...fileIds].map(deleteAssignmentFile));
      setPendingDelete(null);
      setExpanded(null);
      setOperationMessage(cleanup.some((result) => result.status === "rejected") ? "Задание и ответы удалены. Некоторые вложения не удалось очистить из хранилища браузера." : "Задание и связанные ответы удалены.");
    } catch {
      setDeleteError("Не удалось удалить задание. Проверьте доступ к хранилищу и повторите попытку.");
    } finally {
      setSaving(false);
    }
  };

  const sendAnswer = async (assignment: Assignment, text: string, file: File | null): Promise<boolean> => {
    if (saving || answerSendLock.current || role !== "student" || !text.trim() || !visibleIds.has(assignment.id)) return false;
    answerSendLock.current = true;
    const expectedAttempt = getCurrentSubmissionAttempt(mine.find((item) => item.assignmentId === assignment.id));
    const readTarget = () => {
      const target = getAssignments().find((item) => item.id === assignment.id);
      if (!target || !isAssignmentVisibleToStudent(target, student.group) || !currentUser.memberships.some((membership) => membership.subjectId === target.subjectId && membership.groupIds.includes(target.groupId)) || !isSubmissionAllowed(target)) throw new AnswerSendError("Приём ответов уже закрыт или задание недоступно. Отправка остановлена.");
      if (target.updatedAt !== assignment.updatedAt) throw new AnswerSendError("Условия задания изменились. Перечитайте их перед отправкой. Ответ не отправлен.");
      const records = getSubmissions();
      const previous = records.find((item) => item.assignmentId === assignment.id && item.studentId === student.id);
      const currentAttempt = getCurrentSubmissionAttempt(previous);
      if ((previous && currentAttempt?.status !== "revision") || currentAttempt?.id !== expectedAttempt?.id || currentAttempt?.updatedAt !== expectedAttempt?.updatedAt) throw new AnswerSendError("Ответ уже изменён в другой вкладке. Проверьте актуальную попытку перед отправкой.");
      return { target, records, previous, currentAttempt };
    };
    setOperationError("");
    setOperationMessage("");
    setSaving(true);
    let newAttachmentId: string | undefined;
    try {
    readTarget();
    newAttachmentId = file ? await saveAssignmentFile(file) : undefined;
    const { target, records, previous, currentAttempt } = readTarget();
    const attachmentId = newAttachmentId ?? currentAttempt?.attachmentId;
    const now = new Date().toISOString();
    const attempt: SubmissionAttempt = {
      id: crypto.randomUUID(),
      number: getSubmissionAttempts(previous).length + 1,
      sentAt: now,
      updatedAt: now,
      text,
      attachmentId,
      attachmentName: file?.name ?? currentAttempt?.attachmentName,
      status: "submitted",
      submittedLate: isAttemptLate(target, now),
    };
    const attempts = [...getSubmissionAttempts(previous), attempt];
    const item: Submission = {
      id: previous?.id ?? crypto.randomUUID(),
      assignmentId: assignment.id,
      studentId: student.id,
      studentName: student.name,
      sentAt: previous?.sentAt ?? now,
      updatedAt: now,
      status: "submitted",
      text,
      attachmentId: attempt.attachmentId,
      attachmentName: attempt.attachmentName,
      attemptCount: attempts.length,
      attempts,
    };
    persistSubmissions([...records.filter((entry) => !(entry.assignmentId === assignment.id && entry.studentId === student.id)), item]);
    try { addNotification({ recipientUserId: DEMO_TEACHER_ID, kind: "submission", title: previous ? "Работа отправлена повторно" : "Получен новый ответ", body: `${student.name} · ${assignment.title} · попытка ${attempt.number}`, href: getAssignmentHref(assignment, item.id), dedupeKey: `submission:${item.id}:attempt:${attempt.number}` }); } catch { /* Ответ уже сохранён; уведомление можно восстановить отдельно. */ }
    setOperationMessage(previous ? "Новая попытка отправлена преподавателю." : "Ответ отправлен преподавателю. Статус проверки появится в этом задании.");
    return true;
    } catch (error) {
      if (newAttachmentId) void deleteAssignmentFile(newAttachmentId).catch(() => {});
      setOperationError(error instanceof AnswerSendError ? error.message : "Не удалось отправить работу. Ответ остался в форме — повторите попытку.");
      setAssignments(getAssignments());
      setSubmissions(getSubmissions());
      return false;
    } finally {
      setSaving(false);
      answerSendLock.current = false;
    }
  };

  const review = (submission: Submission, status: "revision" | "graded", comment: string, gradeValue: string): boolean => {
    if (saving || role !== "teacher" || !visibleIds.has(submission.assignmentId)) return false;
    const records = getSubmissions();
    const latest = records.find((item) => item.id === submission.id);
    const currentAttempt = getCurrentSubmissionAttempt(latest);
    if (!latest || !currentAttempt || currentAttempt.status !== "submitted" || currentAttempt.id !== getCurrentSubmissionAttempt(submission)?.id) {
      setSubmissions(records);
      setOperationError("Ответ уже изменился. Проверьте актуальную попытку перед сохранением.");
      return false;
    }
    const teacherComment = comment.trim();
    const grade = gradeValue.trim();
    if ((status === "revision" && !teacherComment) || (status === "graded" && !["5", "4", "3", "2"].includes(grade))) return false;
    setOperationError("");
    setOperationMessage("");
    setSaving(true);
    try {
    const now = new Date().toISOString();
    const reviewedAttempt: SubmissionAttempt = {
      ...currentAttempt,
      status,
      grade: status === "graded" ? grade : undefined,
      teacherComment: teacherComment || undefined,
      reviewedAt: now,
      updatedAt: now,
    };
    const attempts = getSubmissionAttempts(latest).map((attempt) => attempt.id === currentAttempt.id ? reviewedAttempt : attempt);
    const updated: Submission = { ...latest, status, grade: reviewedAttempt.grade, teacherComment: reviewedAttempt.teacherComment, updatedAt: now, attemptCount: attempts.length, attempts };
    persistSubmissions(records.map((item) => item.id === submission.id ? updated : item));
    const assignment = assignments.find((item) => item.id === submission.assignmentId);
    try { addNotification({ recipientUserId: submission.studentId, kind: status === "revision" ? "revision" : "grade", title: status === "revision" ? "Работа возвращена на доработку" : `Получена оценка ${grade}`, body: teacherComment || "Откройте задание, чтобы посмотреть результат.", href: assignment ? getAssignmentHref(assignment) : "/journal", dedupeKey: `submission-reviewed:${submission.id}:attempt:${currentAttempt.number}:${status}` }); } catch { /* Решение преподавателя уже сохранено. */ }
    setOperationMessage(status === "revision" ? "Работа возвращена на доработку. Студенту доступен ваш комментарий." : `Оценка ${grade} сохранена. Студенту доступен результат проверки.`);
    return true;
    } catch {
      setOperationError("Не удалось сохранить результат проверки. Повторите попытку.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return <div className={styles.layout}>
    <div className={styles.overview}>
      {role === "teacher" ? <><div><span>Заданий</span><strong>{visible.length}</strong></div><div><span>Ждут проверки</span><strong>{awaitingReview}</strong></div><div><span>На доработке</span><strong>{revisions}</strong></div><div><span>Проверено</span><strong>{checkedAnswers}</strong></div></> : <><div><span>Всего заданий</span><strong>{visible.length}</strong></div><div><span>Требуют действия</span><strong>{studentActionRequired}</strong></div><div><span>На проверке</span><strong>{mine.filter((item) => visibleIds.has(item.assignmentId) && getSubmissionStatus(item) === "submitted").length}</strong></div><div><span>Оценено</span><strong>{mine.filter((item) => visibleIds.has(item.assignmentId) && getSubmissionStatus(item) === "graded").length}</strong></div></>}
    </div>
    <div className={styles.toolbar}><div><strong>Лента заданий</strong><span> · полный цикл сдачи и проверки</span></div>{role === "teacher" && <button type="button" className={styles.primary} disabled={saving} onClick={startAssignment}>{creating ? "К редактированию" : "+ Добавить задание"}</button>}</div>
    {operationError && <p className={styles.operationError} role="alert">{operationError}</p>}
    {!operationError && operationMessage && <p className={styles.operationMessage} role="status">{operationMessage}</p>}
    {requestedAssignment && !expanded && <div className={styles.unavailable} role="status"><strong>Задание недоступно</strong><span>Возможно, оно удалено, ещё не опубликовано или относится к другой группе.</span><button type="button" onClick={() => setExpanded(null)}>Показать доступные задания</button></div>}
    {visible.length > 0 && <SearchField label="Поиск по заданиям" placeholder="Название, описание или предмет" value={assignmentQuery} onChange={setAssignmentQuery} />}
    {expanded && !displayedAssignments.some((item) => item.id === expanded) && <div className={styles.unavailable} role="status"><span>Открытое задание скрыто текущими фильтрами.</span><button type="button" onClick={resetAssignmentFilters}>Показать открытое задание</button></div>}
    {role === "teacher" && <div className={styles.assignmentFilters}>{([['all', 'Все'], ['draft', 'Черновики'], ['published', 'Опубликованные'], ['closed', 'Завершённые'], ['archived', 'Архив']] as const).map(([value, label]) => <button className={assignmentFilter === value ? styles.filterActive : ""} aria-pressed={assignmentFilter === value} onClick={() => setAssignmentFilter(value)} key={value}>{label}</button>)}</div>}
    {creating && <form ref={formRef} className={styles.createForm} onSubmit={create} aria-labelledby={`${componentId}-form-title`} aria-busy={saving}>
      <header className={styles.editorHeader}><div><span>{editingId ? "Редактирование" : "Новое задание"}</span><h2 id={`${componentId}-form-title`}>{editingId ? "Обновить задание" : "Подготовить задание"}</h2><p>{form.subject} · {form.group}</p></div><span className={styles.editorState}>{formDirty ? "Есть изменения" : editingId ? "Нет новых изменений" : "Поля готовы к заполнению"}</span></header>
      <fieldset className={styles.formFields} disabled={saving}><div className={styles.formGrid}>
      {!subject && <Dropdown label="Предмет" value={form.subject} onChange={(nextSubject) => { const nextSubjectId = getAcademicSubjectByName(nextSubject)?.id; setForm({ ...form, subject: nextSubject, group: (nextSubjectId ? getSubjectGroups(nextSubjectId)[0]?.name : undefined) ?? form.group }); }} options={SUBJECTS.map((item) => ({ value: item, label: item }))} />}
      {!group && <Dropdown label="Группа" value={form.group} onChange={(value) => setForm({ ...form, group: value })} options={availableGroups.map((item) => ({ value: item.name, label: item.name }))} />}
      <Dropdown label="Статус задания" value={form.status} onChange={(value) => setForm({ ...form, status: value as AssignmentStatus })} options={[{ value: "draft", label: "Черновик" }, { value: "published", label: "Опубликовать" }, { value: "closed", label: "Завершить" }, { value: "archived", label: "В архив" }]} /><Dropdown label="Тип занятия" value={form.lessonType} onChange={(value) => setForm({ ...form, lessonType: value as LessonType })} options={["Лекция", "Практика", "Лабораторная"].map((value) => ({ value, label: value }))} />
      <div className={styles.dateField}><span>Дата и время занятия</span><DateTimePicker value={form.lessonDate ? new Date(form.lessonDate) : undefined} onChange={(date) => date && setForm({ ...form, lessonDate: localDateTime(date) })} placeholder="Выберите занятие" ariaLabel="Дата и время занятия" /></div><Checkbox className={styles.checkboxField} label="Разрешить ответы после дедлайна" checked={form.allowLateSubmissions} disabled={saving} onChange={(checked) => setForm({ ...form, allowLateSubmissions: checked })} />
      <label className={styles.wide}>Название<input ref={titleRef} required value={form.title} placeholder="Например, практикум по условной вероятности" onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className={styles.wide}>Описание<textarea required value={form.description} placeholder="Что нужно сделать, как оформить ответ и по каким критериям он оценивается" onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <div className={styles.dateField}><span>Срок сдачи</span><DateTimePicker value={form.deadline ? new Date(form.deadline) : undefined} onChange={(date) => date && setForm({ ...form, deadline: localDateTime(date) })} placeholder="Выберите дедлайн" ariaLabel="Срок сдачи" /></div><AttachmentPicker key={editingId ?? "new-task"} label="Файл задания" file={taskFile} onChange={setTaskFile} retainedName={assignments.find((item) => item.id === editingId)?.attachmentName} disabled={saving} />
    </div></fieldset><p className={styles.visibilityHint}><strong>После сохранения</strong>{getAssignmentVisibility(form.status)}</p>{formError && <p ref={formErrorRef} tabIndex={-1} className={styles.operationError} role="alert">{formError}</p>}<div className={styles.formActions}><span>{formDirty ? "Изменения ещё не сохранены" : editingId ? "Изменения будут видны после сохранения" : "Перед публикацией можно проверить результат"}</span><button disabled={saving} type="button" onClick={closeEditor}>Отмена</button>{(!editingId || assignments.find((item) => item.id === editingId)?.status === "draft") && form.status !== "draft" && <button type="button" disabled={saving} onClick={() => { void saveAssignment("draft"); }}>Сохранить черновик</button>}<button type="submit" disabled={saving} className={styles.primary}>{saving ? "Сохраняем…" : "Предпросмотр"}</button></div></form>}
    <div className={styles.list}>{displayedAssignments.map((assignment) => {
      const answers = submissions.filter((item) => item.assignmentId === assignment.id);
      const myAnswer = mine.find((item) => item.assignmentId === assignment.id);
      const currentAttempt = getCurrentSubmissionAttempt(myAnswer);
      const open = expanded === assignment.id;
      const studentState = getStudentAssignmentState(assignment, myAnswer);
      const deadlineState = getAssignmentDeadlineState(assignment);
      const submissionClosed = !isSubmissionAllowed(assignment);
      const canSend = !submissionClosed && (!myAnswer || currentAttempt?.status === "revision");
      const stateLabel = studentState === "graded" ? `Оценка ${currentAttempt?.grade}` : studentState === "revision" ? submissionClosed ? "Доработка · приём закрыт" : "Нужна доработка" : studentState === "resubmitted" ? "Повторно отправлено" : studentState === "submitted" ? "На проверке" : assignment.status === "closed" ? "Приём завершён" : studentState === "late-allowed" ? "Можно сдать с опозданием" : studentState === "overdue" ? "Приём завершён" : "Ожидает сдачи";
      const detailsId = `${componentId}-${assignment.id}-details`;
      const waiting = answers.filter((answer) => getSubmissionStatus(answer) === "submitted").length;
      const cardTone = role === "teacher" ? assignment.status : studentState;
      const lessonDate = new Date(assignment.lessonDate);
      return <article className={`${styles.card} ${styles[`card_${cardTone}`] ?? ""} ${role === "student" && studentState === "graded" ? styles[`grade_${currentAttempt?.grade}`] ?? "" : ""} ${open ? styles.targetCard : ""}`} ref={open ? selectedAssignmentRef : undefined} key={assignment.id}>
        <button type="button" data-assignment-toggle="true" className={styles.cardHeader} onClick={() => setExpanded(open ? null : assignment.id)} aria-expanded={open} aria-controls={open ? detailsId : undefined}>
          <span className={styles.cardIntro}><span className={`${styles.assignmentStatus} ${styles[`assignmentStatus_${assignment.status}`] ?? ""}`}>{role === "teacher" ? STATUS_LABELS[assignment.status] : isSubmissionAllowed(assignment) ? "Приём открыт" : "Приём завершён"}</span><span className={styles.cardIdentity}><span className={styles.meta}><span className={styles.lessonType}>{assignment.lessonType}</span><time className={styles.lessonDate} dateTime={assignment.lessonDate}>{lessonDate.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</time></span><strong className={styles.cardTitle}>{assignment.title}</strong><small>{assignment.subject} · {assignment.group}</small></span></span>
          <span className={styles.headerAside}><span className={styles.deadlineLabel}>Срок сдачи</span><time className={`${styles.deadline} ${role === "student" && deadlineState === "overdue" && !myAnswer ? styles.deadlineOverdue : ""}`} dateTime={assignment.deadline}>{new Date(assignment.deadline).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time><span className={styles.answerCounts}>{role === "teacher" ? <><span>Ответы <b>{answers.length}</b></span><span className={waiting ? styles.waitingCount : ""}>На проверке <b>{waiting}</b></span></> : <b>{stateLabel}</b>}</span></span>
          <ArrowCircle direction={open ? "up" : "down"} className={styles.cardArrow} />
        </button>
        {open && <div id={detailsId} className={styles.details}><section className={styles.assignmentBrief} aria-labelledby={`${detailsId}-brief`}><div className={styles.briefHeading}><h3 id={`${detailsId}-brief`}>Условие задания</h3>{role === "teacher" && <div className={styles.detailActions}>{assignment.status === "draft" && <button disabled={saving} className={styles.primary} onClick={() => publishDraft(assignment)}>Опубликовать</button>}<button disabled={saving} onClick={() => editAssignment(assignment)}>Редактировать</button><button disabled={saving} className={styles.dangerButton} onClick={() => { setDeleteError(""); setPendingDelete(assignment); }}>Удалить</button></div>}</div><p>{assignment.description}</p>{assignment.attachmentId && assignment.attachmentName && <div className={styles.taskAttachment}><span>Файл задания</span><DownloadButton name={assignment.attachmentName} className={styles.fileButton} onDownload={() => downloadAssignmentFile(assignment.attachmentId!, assignment.attachmentName!)} /></div>}</section>
          {role === "student" ? <>
            <div className={styles.workflowStatus}><span className={`${styles.workflowDot} ${styles[`workflowDot_${currentAttempt?.status ?? studentState}`]}`} /><div><strong>{stateLabel}</strong><span>{currentAttempt?.status === "submitted" ? "Работа зафиксирована. Изменить её можно после возврата преподавателем." : currentAttempt?.status === "graded" ? "Цикл задания завершён." : submissionClosed ? "Срок или приём работ завершён. Уточните возможность сдачи у преподавателя." : currentAttempt?.status === "revision" ? "Исправьте работу по комментарию и отправьте новую попытку." : "Подготовьте ответ и отправьте его преподавателю."}</span></div></div>
            <AssignmentProgress state={studentState} />
            {canSend && <AnswerComposer key={`${student.id}:${assignment.id}:${currentAttempt?.id ?? "first"}`} studentId={student.id} assignmentId={assignment.id} assignmentVersion={assignment.updatedAt} attempt={currentAttempt} saving={saving} onSend={(text, file) => sendAnswer(assignment, text, file)} />}
            {myAnswer && <div className={styles.studentHistory}><AttemptHistory attempts={getSubmissionAttempts(myAnswer)} /></div>}
          </> : <SubmissionWorkspace key={assignment.id} answers={answers} students={journal.students} rosterError={journal.error} currentId={requestedSubmission} targetRef={selectedSubmissionRef} saving={saving} drafts={reviewDrafts} onDraftChange={updateReviewDraft} onSelect={selectSubmission} onReview={review} />}
        </div>}
      </article>;
    })}{!displayedAssignments.length && <div className={styles.emptyState}>
      <strong>{visible.length ? "Задания не найдены" : "Заданий пока нет"}</strong>
      <span>{visible.length ? "Измените поисковый запрос или покажите все задания." : role === "teacher" ? "Создайте первое задание и опубликуйте его для группы." : "Преподаватель ещё не публиковал задания по предмету."}</span>
      {visible.length ? <button type="button" onClick={resetAssignmentFilters}>Показать все задания</button> : role === "teacher" && <button type="button" className={styles.primary} onClick={startAssignment}>+ Добавить задание</button>}
    </div>}</div>
    {pendingDelete && <ConfirmDialog title="Удалить задание?" busy={saving} error={deleteError} onCancel={() => setPendingDelete(null)} onConfirm={() => { void deleteAssignment(pendingDelete); }}><p><strong>{pendingDelete.title}</strong></p><p>Будут удалены задание, ответы студентов ({submissions.filter((item) => item.assignmentId === pendingDelete.id).length}) и вложения всех попыток. Восстановить их нельзя.</p></ConfirmDialog>}
    {previewing && <AssignmentPreview form={form} publishing={form.status === "published" && assignments.find((item) => item.id === editingId)?.status !== "published"} attachmentName={taskFile?.name ?? assignments.find((item) => item.id === editingId)?.attachmentName} attachmentSize={taskFile?.size} saving={saving} error={formError} onBack={() => setPreviewing(false)} onSave={() => { void saveAssignment(); }} />}
    {pendingFormAction && <ConfirmDialog title="Оставить изменения без сохранения?" confirmLabel="Не сохранять" cancelLabel="Продолжить редактирование" onCancel={() => setPendingFormAction(null)} onConfirm={() => { const action = pendingFormAction; setPendingFormAction(null); action(); }}><p>В открытом задании есть несохранённые изменения. Выбранный файл тоже не будет прикреплён.</p></ConfirmDialog>}
  </div>;
};

export default AssignmentCenter;
