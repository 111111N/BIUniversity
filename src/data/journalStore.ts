import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { SetStateAction } from "react";
import type { Grade, Student } from "../components/Attendance/data/students";
import { createSubjectLessons } from "./lessons";
import { getAcademicGroup, getAcademicSubjectDefinition, SUBJECT_GROUP_OFFERINGS } from "./academicCatalog";
import { JournalDraftConflictError } from "../domain/journalDraft";
import { createJournalDemoAdditions } from "./demo/journals";

export const CURRENT_STUDENT_ID = "anna-smirnova";
export const JOURNAL_PERIOD = "Сентябрь — ноябрь 2026 · демонстрационные занятия";
const CHANGE_EVENT = "bi-university-journal-change";
export const JOURNAL_SCHEMA_VERSION = 2;
class JournalWriteError extends Error {}
export const journalKey = (subject: string, group: string) => `bi-university-journal-v1:${subject}:${group}`;
const historyKey = (subject: string, group: string) => `bi-university-journal-history-v1:${subject}:${group}`;

export type JournalActor = {
  id: string;
  name: string;
  role?: "teacher" | "student";
  memberships?: Array<{ subjectId: string; groupIds: string[] }>;
};
export type JournalChange = {
  id: string;
  changedAt: string;
  actor: JournalActor;
  studentId: string;
  studentName: string;
  lessonId?: string;
  field: "attendance" | "grade" | "roster" | "demo";
  previousValue: string | number | null;
  nextValue: string | number | null;
};

export const createDemoJournal = (subject: string, group: string): Student[] => {
  const lessons = createSubjectLessons(subject, group).filter((lesson) => !lesson.id.includes(":weekly:"));
  const seed = [...`${subject}:${group}`].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  const names = [
    "Анна Смирнова", "Иван Иванов", "Мария Петрова", "Алексей Сидоров", "Елена Козлова",
    "Дмитрий Николаев", "Сергей Фёдоров", "Ольга Куликова", "Павел Смирнов", "Татьяна Васильева",
    "Виктор Андреев", "Юлия Григорьева", "Игорь Егоров", "Наталья Соколова", "Артём Кузнецов",
    "Марина Лебедева", "Константин Орлов", "Ирина Воронова", "Михаил Тихонов", "Светлана Киселёва",
    "Николай Зайцев", "Анастасия Фролова", "Андрей Савельев", "Елизавета Михайлова", "Олег Дмитриев",
    "Виктория Павлова", "Аркадий Романов", "Полина Алексеева", "Владислав Семёнов", "Ксения Ефимова",
    "Максим Соколов", "Дарья Белова",
  ];
  return names.slice(0, getAcademicGroup(group)?.students ?? 5).map((name, index) => ({
    id: index === 0 && group === "112-mko" ? CURRENT_STUDENT_ID : `${group}-${index + 1}`,
    name,
    attendance: Object.fromEntries(lessons.map((lesson, day) => [lesson.id, (seed + index + day) % 11 === 0 ? "unmarked" : (seed + index + day) % 13 === 0 ? "sick" : (seed + index + day) % 7 === 0 ? "absent" : "present"])),
    grades: Object.fromEntries(lessons.map((lesson, day) => [lesson.id, lesson.type === "lecture" ? null : ([2, 3, 4, 5, 4, 5, null] as Grade[])[(seed + index + day) % 7]])),
  }));
};

export const decodeJournal = (raw: string): Student[] | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    const isRecord = (item: unknown): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item);
    const value: unknown = isRecord(parsed) && parsed.version === JOURNAL_SCHEMA_VERSION ? parsed.students : parsed;
    if (!Array.isArray(value)) return null;
    if (!value.every((item: unknown) => isRecord(item) && typeof item.id === "string" && typeof item.name === "string"
      && isRecord(item.attendance) && Object.values(item.attendance).every((status) => ["unmarked", "present", "sick", "absent"].includes(String(status)))
      && isRecord(item.grades) && Object.values(item.grades).every((grade) => grade === null || [2, 3, 4, 5].includes(grade as number)))) return null;
    if (new Set(value.map((item: Student) => item.id)).size !== value.length) return null;
    return value as Student[];
  } catch { return null; }
};

export const encodeJournal = (students: Student[]) => JSON.stringify({ version: JOURNAL_SCHEMA_VERSION, students });

const readHistoryState = (key: string): { changes: JournalChange[]; error: string } => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) throw new Error("Invalid history");
    const changes = value.filter((item): item is JournalChange => {
      if (!item || typeof item !== "object") return false;
      const entry = item as Partial<JournalChange>;
      const validValue = (cell: unknown) => cell === null || typeof cell === "string" || (typeof cell === "number" && Number.isFinite(cell));
      return typeof entry.id === "string" && Boolean(entry.id) && typeof entry.changedAt === "string" && Number.isFinite(Date.parse(entry.changedAt))
        && typeof entry.studentId === "string" && typeof entry.studentName === "string" && (entry.lessonId === undefined || typeof entry.lessonId === "string")
        && ["attendance", "grade", "roster", "demo"].includes(entry.field ?? "") && validValue(entry.previousValue) && validValue(entry.nextValue)
        && Boolean(entry.actor && typeof entry.actor.id === "string" && typeof entry.actor.name === "string");
    });
    const unique = Array.from(new Map(changes.map((change) => [change.id, change])).values());
    return { changes: unique.sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt)), error: unique.length === value.length ? "" : "Часть записей истории повреждена и не показана. Исходные данные не изменены; сохранение журнала приостановлено, чтобы не перезаписать историю." };
  } catch { return { changes: [], error: "Не удалось прочитать историю журнала. Сохранение приостановлено, исходные данные не изменены." }; }
};

const collectChanges = (previous: Student[], next: Student[], actor: JournalActor): JournalChange[] => {
  const changedAt = new Date().toISOString();
  const changes: JournalChange[] = [];
  const previousById = new Map(previous.map((student) => [student.id, student]));
  const nextById = new Map(next.map((student) => [student.id, student]));
  const add = (change: Omit<JournalChange, "id" | "changedAt" | "actor">) => changes.push({ ...change, id: crypto.randomUUID(), changedAt, actor });

  next.forEach((student) => {
    const before = previousById.get(student.id);
    if (!before) {
      add({ studentId: student.id, studentName: student.name, field: "roster", previousValue: null, nextValue: "added" });
      return;
    }
    if (before.name !== student.name) add({ studentId: student.id, studentName: student.name, field: "roster", previousValue: before.name, nextValue: student.name });
    const lessonIds = new Set([...Object.keys(before.attendance), ...Object.keys(student.attendance), ...Object.keys(before.grades), ...Object.keys(student.grades)]);
    lessonIds.forEach((lessonId) => {
      const oldAttendance = before.attendance[lessonId] ?? "unmarked";
      const newAttendance = student.attendance[lessonId] ?? "unmarked";
      if (oldAttendance !== newAttendance) add({ studentId: student.id, studentName: student.name, lessonId, field: "attendance", previousValue: oldAttendance, nextValue: newAttendance });
      const oldGrade = before.grades[lessonId] ?? null;
      const newGrade = student.grades[lessonId] ?? null;
      if (oldGrade !== newGrade) add({ studentId: student.id, studentName: student.name, lessonId, field: "grade", previousValue: oldGrade, nextValue: newGrade });
    });
  });
  previous.forEach((student) => {
    if (!nextById.has(student.id)) add({ studentId: student.id, studentName: student.name, field: "roster", previousValue: "active", nextValue: "removed" });
  });
  return changes;
};

const migrateLessonKeys = (students: Student[], subject: string, group: string) => {
  const lessons = createSubjectLessons(subject, group);
  const lessonByDate = new Map(lessons.map((lesson) => [lesson.date, lesson.id]));
  const migrateRecord = <T,>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).map(([key, value]) => [lessonByDate.get(key) ?? key, value]));
  return students.map((student) => {
    const grades = migrateRecord(student.grades);
    lessons.forEach((lesson) => { if (lesson.type === "lecture") grades[lesson.id] = null; });
    return { ...student, attendance: migrateRecord(student.attendance), grades };
  });
};

export const getJournalSnapshot = (subject: string, group: string) => {
  try {
    const raw = localStorage.getItem(journalKey(subject, group));
    const students = raw === null ? createDemoJournal(subject, group) : decodeJournal(raw);
    return students ? migrateLessonKeys(students, subject, group) : createDemoJournal(subject, group);
  } catch {
    return createDemoJournal(subject, group);
  }
};

export const subscribeJournalStore = (listener: () => void) => {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
};

/** Explicit demo action only. Existing cells and roster stay intact; audit uses the normal 200-record retention. */
export const appendJournalDemoRecords = (subject: string, group: string, actor: JournalActor) => {
  if (actor.role !== "teacher" || !actor.memberships?.some((membership) => membership.subjectId === subject && membership.groupIds.includes(group))
    || !getAcademicSubjectDefinition(subject) || !getAcademicGroup(group) || !SUBJECT_GROUP_OFFERINGS.some((offering) => offering.subjectId === subject && offering.groupId === group)) {
    throw new JournalWriteError("Недостаточно прав для добавления демонстрационных отметок в этот журнал.");
  }
  const key = journalKey(subject, group);
  const auditKey = historyKey(subject, group);
  const raw = localStorage.getItem(key);
  const previous = raw === null ? createDemoJournal(subject, group) : decodeJournal(raw);
  if (!previous) throw new JournalWriteError("Журнал повреждён: демонстрационные отметки не добавлены, исходные данные сохранены.");
  const history = readHistoryState(auditKey);
  if (history.error) throw new JournalWriteError(history.error);
  const addition = createJournalDemoAdditions(subject, group, migrateLessonKeys(previous, subject, group));
  if (!addition.cells) return { journals: 0, cells: 0, grades: 0 };
  const event: JournalChange = {
    id: crypto.randomUUID(), changedAt: new Date().toISOString(), actor,
    studentId: "demo-import", studentName: "Демонстрационный набор", field: "demo", previousValue: null,
    nextValue: `Добавлены отсутствующие ячейки: ${addition.cells}, в том числе оценки: ${addition.grades}; занятий: ${addition.lessons}. Период: ${addition.from} — ${addition.to}. Это демонстрационные, а не реальные отметки.`,
  };
  const previousHistory = localStorage.getItem(auditKey);
  // One event per journal, not thousands of fabricated historical edits; repeated imports are no-ops.
  const encodedHistory = JSON.stringify([event, ...history.changes].slice(0, 200));
  const encoded = encodeJournal(addition.students);
  localStorage.setItem(auditKey, encodedHistory);
  try { localStorage.setItem(key, encoded); }
  catch (error) {
    try {
      if (previousHistory === null) localStorage.removeItem(auditKey);
      else localStorage.setItem(auditKey, previousHistory);
    } catch { throw new JournalWriteError("Демонстрационные отметки не сохранены. Не удалось восстановить прежнюю историю после сбоя хранилища; проверьте её перед повторным импортом."); }
    throw error;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return { journals: 1, cells: addition.cells, grades: addition.grades };
};

export const useJournal = (subject: string, group: string, actor: JournalActor = { id: "demo-user", name: "Демо-пользователь" }) => {
  const key = journalKey(subject, group);
  const auditKey = historyKey(subject, group);
  const [error, setError] = useState("");
  const getSnapshot = useCallback(() => {
    try { return localStorage.getItem(key); } catch { return "unavailable"; }
  }, [key]);
  const raw = useSyncExternalStore(subscribeJournalStore, getSnapshot);
  const decoded = useMemo(() => {
    const students = raw === null ? createDemoJournal(subject, group) : decodeJournal(raw);
    return students ? migrateLessonKeys(students, subject, group) : null;
  }, [raw, subject, group]);
  const students = decoded ?? [];
  const historyState = readHistoryState(auditKey);
  const history = historyState.changes;
  const canEdit = actor.role === "teacher" && actor.memberships?.some((membership) => membership.subjectId === subject && membership.groupIds.includes(group)) === true;
  const setStudents = useCallback((action: SetStateAction<Student[]>) => {
    if (!canEdit) {
      setError("Недостаточно прав для изменения журнала этой группы.");
      throw new Error("Journal access denied");
    }
    try {
      const current = localStorage.getItem(key);
      const saved = current === null ? createDemoJournal(subject, group) : decodeJournal(current);
      const previous = saved ? migrateLessonKeys(saved, subject, group) : null;
      if (!previous) throw new Error("invalid data");
      const next = typeof action === "function" ? action(previous) : action;
      const changes = collectChanges(previous, next, actor);
      const encoded = encodeJournal(next);
      const currentHistory = readHistoryState(auditKey);
      if (currentHistory.error) throw new JournalWriteError(currentHistory.error);
      if (changes.length) {
        const previousHistory = localStorage.getItem(auditKey);
        localStorage.setItem(auditKey, JSON.stringify([...changes.reverse(), ...currentHistory.changes].slice(0, 200)));
        try { localStorage.setItem(key, encoded); }
        catch (error) {
          try {
            if (previousHistory === null) localStorage.removeItem(auditKey);
            else localStorage.setItem(auditKey, previousHistory);
          } catch { throw new JournalWriteError("Журнал не сохранён. Не удалось восстановить прежнюю историю после сбоя хранилища; проверьте её перед повторным сохранением."); }
          throw error;
        }
      } else localStorage.setItem(key, encoded);
      setError("");
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch (error) {
      const message = error instanceof JournalDraftConflictError || error instanceof JournalWriteError ? error.message : "Не удалось сохранить журнал. Проверьте доступность хранилища браузера и повторите попытку.";
      setError(message);
      throw new Error(message);
    }
  }, [key, auditKey, subject, group, actor, canEdit]);
  return { students, setStudents, canEdit, history, historyError: historyState.error, lastSavedAt: history[0]?.changedAt ?? null, error: error || (decoded === null ? "Не удалось прочитать журнал. Сохранённые данные не изменены." : "") };
};
