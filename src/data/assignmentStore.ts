import { decodeSavedAssignments, decodeSavedSubmissions, type SavedSubmission } from "../domain/assignmentStorage";
import { getAcademicGroupByName, getAcademicSubjectByName } from "./academicCatalog";
import { getAttachmentError } from "../domain/files";
import { downloadBlob } from "../domain/fileDownload";

export type LessonType = "Лекция" | "Практика" | "Лабораторная";
export type AssignmentStatus = "draft" | "published" | "closed" | "archived";
export type SubmissionStatus = "submitted" | "revision" | "graded";

export interface Assignment {
  id: string;
  subjectId: string;
  groupId: string;
  subject: string;
  group: string;
  lessonDate: string;
  lessonType: LessonType;
  title: string;
  description: string;
  deadline: string;
  attachmentId?: string;
  attachmentName?: string;
  status: AssignmentStatus;
  allowLateSubmissions: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionAttempt {
  id: string;
  number: number;
  sentAt: string;
  updatedAt: string;
  text: string;
  attachmentId?: string;
  attachmentName?: string;
  status: SubmissionStatus;
  submittedLate: boolean;
  teacherComment?: string;
  grade?: string;
  reviewedAt?: string;
}

/**
 * Submission is a student's assignment workflow. The top-level answer fields mirror
 * the latest attempt so older screens and persisted demo data remain compatible.
 */
export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  sentAt: string;
  text: string;
  attachmentId?: string;
  attachmentName?: string;
  comment?: string;
  grade?: string;
  teacherComment?: string;
  status: SubmissionStatus;
  updatedAt: string;
  /** Added in the attempt-history schema; optional for legacy typed consumers. */
  attemptCount?: number;
  attempts?: SubmissionAttempt[];
}

const ASSIGNMENTS_KEY = "bi-university-demo-assignments";
const SUBMISSIONS_KEY = "bi-university-demo-submissions";
const DB_NAME = "bi-university-learning-files";
const STORE_NAME = "files";
const CHANGE_EVENT = "bi-university-assignments-change";

const initialAssignments: Assignment[] = [
  { id: "linear-algebra-rgr-2", subjectId: "theory-of-probability", groupId: "112-mko", subject: "Теория вероятностей", group: "112-МКо", lessonDate: "2026-09-12T09:00", lessonType: "Практика", title: "Расчётно-графическая работа №2", description: "Решить задачи 1–8 и приложить оформленное решение одним файлом.", deadline: "2026-09-14T23:59", status: "published", allowLateSubmissions: true, createdAt: "2026-09-10T10:00", updatedAt: "2026-09-10T10:00" },
  { id: "programming-sort", subjectId: "mathematical-statistics", groupId: "112-mko", subject: "Математическая статистика", group: "112-МКо", lessonDate: "2026-09-15T11:00", lessonType: "Лабораторная", title: "Статистическая выборка", description: "Подготовить выборку и рассчитать основные статистические характеристики.", deadline: "2026-09-19T18:00", status: "published", allowLateSubmissions: false, createdAt: "2026-09-11T12:00", updatedAt: "2026-09-11T12:00" },
];

const readList = <T,>(key: string, fallback: T[]) => {
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
};

const isSubmissionStatus = (value: unknown): value is SubmissionStatus =>
  value === "submitted" || value === "revision" || value === "graded";

const normalizeAssignment = (item: Partial<Assignment> & Pick<Assignment, "id" | "subject" | "group" | "lessonDate" | "lessonType" | "title" | "description" | "deadline">): Assignment => ({
  ...item,
  subjectId: item.subjectId ?? getAcademicSubjectByName(item.subject)?.id ?? "unknown-subject",
  groupId: item.groupId ?? getAcademicGroupByName(item.group)?.id ?? "unknown-group",
  status: item.status ?? "published",
  allowLateSubmissions: item.allowLateSubmissions ?? true,
  createdAt: item.createdAt ?? item.lessonDate,
  updatedAt: item.updatedAt ?? item.createdAt ?? item.lessonDate,
});

type PersistedSubmission = Partial<Submission> & Pick<Submission, "id" | "assignmentId" | "studentId" | "studentName" | "sentAt">;

const normalizeAttempt = (
  item: Partial<SubmissionAttempt>,
  number: number,
  fallback: PersistedSubmission,
  legacy: boolean,
): SubmissionAttempt => {
  const status = isSubmissionStatus(item.status)
    ? item.status
    : item.grade ? "graded" : legacy && isSubmissionStatus(fallback.status) ? fallback.status : legacy && fallback.grade ? "graded" : "submitted";
  return {
    id: item.id ?? `${fallback.id}-attempt-${number}`,
    number,
    sentAt: item.sentAt ?? fallback.sentAt,
    updatedAt: item.updatedAt ?? fallback.updatedAt ?? item.sentAt ?? fallback.sentAt,
    text: item.text ?? (legacy ? fallback.text : undefined) ?? "",
    attachmentId: item.attachmentId ?? (legacy ? fallback.attachmentId : undefined),
    attachmentName: item.attachmentName ?? (legacy ? fallback.attachmentName : undefined),
    status,
    submittedLate: item.submittedLate ?? false,
    teacherComment: item.teacherComment ?? (legacy ? fallback.teacherComment ?? fallback.comment : undefined),
    grade: item.grade ?? (legacy ? fallback.grade : undefined),
    reviewedAt: item.reviewedAt,
  };
};

const normalizeSubmission = (item: PersistedSubmission): Submission => {
  const legacy = !Array.isArray(item.attempts) || item.attempts.length === 0;
  const sourceAttempts = legacy ? [{}] : item.attempts!;
  const attempts = sourceAttempts.map((attempt, index) => normalizeAttempt(attempt, index + 1, item, legacy));
  const current = attempts[attempts.length - 1];

  return {
    ...item,
    sentAt: attempts[0].sentAt,
    text: current.text,
    attachmentId: current.attachmentId,
    attachmentName: current.attachmentName,
    teacherComment: current.teacherComment,
    grade: current.grade,
    status: current.status,
    updatedAt: current.updatedAt,
    attemptCount: attempts.length,
    attempts,
  };
};

const readSavedList = <T,>(key: string, fallback: T[], decode: (raw: string) => T[]): T[] => {
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : decode(raw);
};

export const readAssignmentList = () => readSavedList(ASSIGNMENTS_KEY, initialAssignments, decodeSavedAssignments).map(normalizeAssignment);

export const readAssignmentData = () => ({
  assignments: readAssignmentList(),
  submissions: readSavedList<SavedSubmission>(SUBMISSIONS_KEY, [], decodeSavedSubmissions).map(normalizeSubmission),
});

export const getAssignments = () => readList(ASSIGNMENTS_KEY, initialAssignments).map(normalizeAssignment);
export const saveAssignments = (items: Assignment[]) => {
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGE_EVENT));
};
export const getSubmissions = () => readList<PersistedSubmission>(SUBMISSIONS_KEY, []).map(normalizeSubmission);
export const saveSubmissions = (items: Submission[]) => {
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

/** Add an explicit demo pack without replacing existing or edited records. */
export const appendLearningDemoRecords = (assignments: Assignment[], submissions: Submission[]) => {
  const oldAssignments = localStorage.getItem(ASSIGNMENTS_KEY);
  const oldSubmissions = localStorage.getItem(SUBMISSIONS_KEY);
  for (const raw of [oldAssignments, oldSubmissions]) {
    if (raw !== null && !Array.isArray(JSON.parse(raw))) throw new Error("Повреждённые данные обучения");
  }
  const currentAssignments = getAssignments();
  const currentSubmissions = getSubmissions();
  const assignmentIds = new Set(currentAssignments.map((item) => item.id));
  const submissionIds = new Set(currentSubmissions.map((item) => item.id));
  const addedAssignments = assignments.filter((item) => !assignmentIds.has(item.id));
  const addedIds = new Set(addedAssignments.map((item) => item.id));
  // Never add mock answers to an existing assignment the user may have changed.
  const addedSubmissions = submissions.filter((item) => addedIds.has(item.assignmentId) && !submissionIds.has(item.id));
  if (!addedAssignments.length) return { assignments: 0, submissions: 0 };
  try {
    localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify([...currentAssignments, ...addedAssignments]));
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([...currentSubmissions, ...addedSubmissions]));
  } catch (error) {
    try {
      if (oldAssignments === null) localStorage.removeItem(ASSIGNMENTS_KEY); else localStorage.setItem(ASSIGNMENTS_KEY, oldAssignments);
      if (oldSubmissions === null) localStorage.removeItem(SUBMISSIONS_KEY); else localStorage.setItem(SUBMISSIONS_KEY, oldSubmissions);
    } finally { window.dispatchEvent(new Event(CHANGE_EVENT)); }
    throw error;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return { assignments: addedAssignments.length, submissions: addedSubmissions.length };
};

/** Commit linked records together; do not notify subscribers about a partial deletion. */
export const removeAssignmentRecords = (id: string) => {
  const assignments = getAssignments();
  const submissions = getSubmissions();
  const related = submissions.filter((item) => item.assignmentId === id);
  const previousAssignments = localStorage.getItem(ASSIGNMENTS_KEY);
  const previousSubmissions = localStorage.getItem(SUBMISSIONS_KEY);
  try {
    localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments.filter((item) => item.id !== id)));
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(submissions.filter((item) => item.assignmentId !== id)));
  } catch (error) {
    try {
      if (previousAssignments === null) localStorage.removeItem(ASSIGNMENTS_KEY);
      else localStorage.setItem(ASSIGNMENTS_KEY, previousAssignments);
      if (previousSubmissions === null) localStorage.removeItem(SUBMISSIONS_KEY);
      else localStorage.setItem(SUBMISSIONS_KEY, previousSubmissions);
    } finally { window.dispatchEvent(new Event(CHANGE_EVENT)); }
    throw error;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return { assignment: assignments.find((item) => item.id === id), submissions: related };
};

export const subscribeAssignmentStore = (listener: () => void) => {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === ASSIGNMENTS_KEY || event.key === SUBMISSIONS_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
};

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const saveAssignmentFile = async (file: File) => {
  const error = getAttachmentError(file);
  if (error) throw new Error(error);
  const id = crypto.randomUUID();
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(file, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
  return id;
};

export const deleteAssignmentFile = async (id: string) => {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

export const downloadAssignmentFile = async (id: string, name: string) => {
  const database = await openDatabase();
  let blob: Blob | undefined;
  try {
    blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME);
      const request = transaction.objectStore(STORE_NAME).get(id);
      transaction.oncomplete = () => resolve(request.result as Blob | undefined);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
  if (!(blob instanceof Blob)) throw new Error("Attachment not found");
  downloadBlob(blob, name);
};
