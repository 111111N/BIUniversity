import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { deleteAssignmentFile, removeAssignmentRecords, saveAssignments, saveSubmissions, subscribeAssignmentStore } from "../../data/assignmentStore";
import type { Assignment, Submission, SubmissionAttempt } from "../../data/assignmentStore";
import { saveAssignmentFile } from "../../data/assignmentStore";
import { getCurrentSubmissionAttempt, getSubmissionAttempts, isAssignmentVisibleToStudent, isAttemptLate, isSubmissionAllowed } from "../../domain/assignments";
import { addNotification } from "../../data/notificationStore";
import { ACADEMIC_GROUPS, ACADEMIC_SUBJECTS, getAcademicGroup, getAcademicGroupByName, getAcademicSubjectByName } from "../../data/academicCatalog";
import { getAssignmentHref } from "../../domain/journalNavigation";
import { getAssignmentFormError, type AssignmentForm } from "../../domain/assignmentForm";
import type { ReviewDraft } from "../../domain/submissionReview";
import { useRole } from "../RoleContext";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { changesAssignmentEditor, changesJournalSection } from "../../domain/unsavedNavigation";
import { useJournal } from "../../data/journalStore";
import { readAssignmentData, readAssignmentState } from "./assignmentData";

const DEMO_STUDENT_GROUP = "112-МКо";
const DEMO_STUDENT_ID = "anna-smirnova";
const DEMO_TEACHER_ID = "teacher-elena-volkova";
const SUBJECTS = ACADEMIC_SUBJECTS.map((item) => item.name);
const GROUPS = ACADEMIC_GROUPS.map((item) => item.name);
class AnswerSendError extends Error {}
class AssignmentSaveError extends Error {}
const localDateTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const createDefaultForm = (subject?: string, group?: string): AssignmentForm => {
  const lesson = new Date();
  lesson.setDate(lesson.getDate() + 1);
  lesson.setHours(9, 0, 0, 0);
  const deadline = new Date(lesson);
  deadline.setDate(deadline.getDate() + 3);
  deadline.setHours(23, 59, 0, 0);
  return { subject: subject ?? SUBJECTS[0], group: group ?? GROUPS[0], lessonDate: localDateTime(lesson), lessonType: "Практика", title: "", description: "", deadline: localDateTime(deadline), status: "published", allowLateSubmissions: false };
};
const assignmentToForm = (item: Assignment): AssignmentForm => ({ subject: item.subject, group: item.group, lessonDate: item.lessonDate, lessonType: item.lessonType, title: item.title, description: item.description, deadline: item.deadline, status: item.status, allowLateSubmissions: item.allowLateSubmissions });

export const useAssignmentController = ({ subject, group }: { subject?: string; group?: string }) => {
  const { role, currentUser } = useRole();
  const membership = currentUser.memberships.find((item) => item.subjectId === getAcademicSubjectByName(subject)?.id);
  const membershipGroup = getAcademicGroup(membership?.groupIds[0])?.name ?? DEMO_STUDENT_GROUP;
  const student = { id: currentUser.role === "student" ? currentUser.id : DEMO_STUDENT_ID, name: currentUser.role === "student" ? currentUser.name : "Анна Смирнова", group: group ?? membershipGroup };
  const [records, setRecords] = useState(readAssignmentState);
  const { assignments, submissions, error: storageError } = records;
  const setAssignments = (items: Assignment[]) => setRecords((current) => ({ ...current, assignments: items }));
  const setSubmissions = (items: Submission[]) => setRecords((current) => ({ ...current, submissions: items }));
  const reload = () => {
    const next = readAssignmentState();
    setRecords((current) => next.error ? { ...current, error: next.error } : next);
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedAssignment = searchParams.get("assignment");
  const requestedSubmission = role === "teacher" ? searchParams.get("submission") : null;
  const editorMode = searchParams.get("editor");
  const creating = role === "teacher" && (editorMode === "new" || editorMode === "edit");
  const publishRequested = searchParams.get("publish") === "1";
  const [previewing, setPreviewing] = useState(false);
  const editingId = creating && editorMode === "edit" ? requestedAssignment : null;
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
  const [editingSnapshot, setEditingSnapshot] = useState<Assignment | null>(null);
  const [formError, setFormError] = useState("");
  const editingVersionRef = useRef<string | null>(null);
  const assignmentSaveLock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const allowEditorExit = useRef(false);
  const editorKey = useRef<string | null>(null);
  const formDirty = creating && (JSON.stringify(form) !== JSON.stringify(originalForm) || Boolean(taskFile));
  const hasReviewDraft = role === "teacher" && submissions.some((submission) => {
    const attempt = getCurrentSubmissionAttempt(submission);
    const draft = reviewDrafts[attempt?.id ?? submission.id];
    return attempt?.status === "submitted" && Boolean(draft?.comment.trim() || draft?.grade);
  });
  useUnsavedChangesWarning(formDirty, (transition) => !allowEditorExit.current && changesAssignmentEditor(transition));
  useUnsavedChangesWarning(hasReviewDraft, changesJournalSection);
  const journal = useJournal(getAcademicSubjectByName(subject)?.id ?? "", getAcademicGroupByName(group)?.id ?? "");

  useEffect(() => subscribeAssignmentStore(() => {
    const next = readAssignmentState();
    setRecords((current) => next.error ? { ...current, error: next.error } : next);
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
    next.delete("editor");
    next.delete("publish");
    next.delete("assignmentTab");
    return next;
  });

  const selectSubmission = (id: string) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set("submission", id);
    next.set("assignmentTab", "work");
    return next;
  }, { replace: true });
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
    if (storageError || saving || assignmentSaveLock.current || role !== "teacher") return;
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
    readAssignmentData();
    attachmentId = taskFile ? await saveAssignmentFile(taskFile) : undefined;
    const latestAssignments = readAssignmentData().assignments;
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
    setPreviewing(false);
    setTaskFile(null);
    allowEditorExit.current = true;
    setExpanded(item.id);
    setOperationMessage(editingId ? "Изменения задания сохранены." : item.status === "draft" ? "Черновик сохранён. Студенты увидят задание после публикации." : "Задание сохранено.");
    } catch (error) {
      console.error("Не удалось сохранить задание:", error);
      if (attachmentId) void deleteAssignmentFile(attachmentId).catch(() => {});
      setFormError(error instanceof AssignmentSaveError ? error.message : "Не удалось сохранить задание. Проверьте доступ к хранилищу и повторите попытку.");
      if (!previewing) requestAnimationFrame(() => formErrorRef.current?.focus());
    } finally {
      setSaving(false);
      assignmentSaveLock.current = false;
    }
  };

  const startAssignment = () => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set("tab", "assignments"); next.set("editor", "new");
    next.delete("assignment"); next.delete("submission"); next.delete("publish");
    return next;
  });
  const closeEditor = () => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.delete("editor"); next.delete("publish");
    return next;
  });
  const editAssignment = (assignment: Assignment, publish = false) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set("tab", "assignments"); next.set("assignment", assignment.id); next.set("editor", "edit");
    next.delete("submission");
    if (publish) next.set("publish", "1"); else next.delete("publish");
    return next;
  });
  const publishDraft = (assignment: Assignment) => {
    if (!saving && role === "teacher" && assignment.status === "draft" && visibleIds.has(assignment.id)) editAssignment(assignment, true);
  };

  const deleteAssignment = async (assignment: Assignment) => {
    if (storageError || saving || role !== "teacher" || !visibleIds.has(assignment.id)) return;
    setOperationError("");
    setOperationMessage("");
    setDeleteError("");
    setSaving(true);
    try {
      readAssignmentData();
      const removed = removeAssignmentRecords(assignment.id);
      const fileIds = new Set([removed.assignment?.attachmentId, ...removed.submissions.flatMap((item) => getSubmissionAttempts(item).map((attempt) => attempt.attachmentId))].filter((id): id is string => Boolean(id)));
      const cleanup = await Promise.allSettled([...fileIds].map(deleteAssignmentFile));
      setPendingDelete(null);
      setExpanded(null);
      setOperationMessage(cleanup.some((result) => result.status === "rejected") ? "Задание и ответы удалены. Некоторые вложения не удалось очистить из хранилища браузера." : "Задание и связанные ответы удалены.");
    } catch (error) {
      console.error("Не удалось удалить задание:", error);
      setDeleteError("Не удалось удалить задание. Проверьте доступ к хранилищу и повторите попытку.");
    } finally {
      setSaving(false);
    }
  };

  const sendAnswer = async (assignment: Assignment, text: string, file: File | null): Promise<boolean> => {
    if (storageError || saving || answerSendLock.current || role !== "student" || !text.trim() || !visibleIds.has(assignment.id)) return false;
    answerSendLock.current = true;
    const expectedAttempt = getCurrentSubmissionAttempt(mine.find((item) => item.assignmentId === assignment.id));
    const readTarget = () => {
      const currentRecords = readAssignmentData();
      const target = currentRecords.assignments.find((item) => item.id === assignment.id);
      if (!target || !isAssignmentVisibleToStudent(target, student.group) || !currentUser.memberships.some((membership) => membership.subjectId === target.subjectId && membership.groupIds.includes(target.groupId)) || !isSubmissionAllowed(target)) throw new AnswerSendError("Приём ответов уже закрыт или задание недоступно. Отправка остановлена.");
      if (target.updatedAt !== assignment.updatedAt) throw new AnswerSendError("Условия задания изменились. Перечитайте их перед отправкой. Ответ не отправлен.");
      const records = currentRecords.submissions;
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
      console.error("Не удалось отправить ответ на задание:", error);
      if (newAttachmentId) void deleteAssignmentFile(newAttachmentId).catch(() => {});
      setOperationError(error instanceof AnswerSendError ? error.message : "Не удалось отправить работу. Ответ остался в форме — повторите попытку.");
      reload();
      return false;
    } finally {
      setSaving(false);
      answerSendLock.current = false;
    }
  };

  const review = (submission: Submission, status: "revision" | "graded", comment: string, gradeValue: string): boolean => {
    if (storageError || saving || role !== "teacher" || !visibleIds.has(submission.assignmentId)) return false;
    let records: Submission[];
    try { records = readAssignmentData().submissions; }
    catch (error) {
      console.error("Не удалось прочитать ответ перед проверкой:", error);
      reload();
      setOperationError("Не удалось прочитать ответ. Решение не сохранено, текст оставлен в форме.");
      return false;
    }
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
    } catch (error) {
      console.error("Не удалось сохранить результат проверки:", error);
      setOperationError("Не удалось сохранить результат проверки. Повторите попытку.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!creating) { editorKey.current = null; return; }
    const key = `${editorMode}:${editingId ?? ""}:${publishRequested}`;
    if (editorKey.current === key) return;
    const source = editingId ? assignments.find((item) => item.id === editingId) : undefined;
    if (editingId && !source) return;
    editorKey.current = key;
    allowEditorExit.current = false;
    setEditingSnapshot(source ?? null);
    const initial = source ? assignmentToForm(source) : createDefaultForm(subject, group);
    setOriginalForm(initial);
    setForm(publishRequested ? { ...initial, status: "published" } : initial);
    editingVersionRef.current = source?.updatedAt ?? null;
    setFormError(""); setTaskFile(null); setPreviewing(publishRequested);
    setOperationError(""); setOperationMessage("");
    const frame = requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [creating, editorMode, editingId, publishRequested, assignments, subject, group]);

  return {
    role, currentUser, student, assignments, submissions, visible, mine, journal, storageError, reload,
    searchParams, setSearchParams, requestedAssignment, requestedSubmission, expanded,
    creating, previewing, setPreviewing, editingId, editingSnapshot, form, setForm, formDirty,
    formError, formRef, formErrorRef, titleRef, taskFile, setTaskFile, saving,
    reviewDrafts, updateReviewDraft, operationError, operationMessage,
    pendingDelete, setPendingDelete, deleteError, setDeleteError,
    startAssignment, closeEditor, editAssignment, publishDraft, setExpanded,
    create, saveAssignment, deleteAssignment, sendAnswer, review, selectSubmission,
  };
};
