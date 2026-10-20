import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStudentProfileMetrics } from "./studentProfileMetrics";
import { getGroupStudentProfiles, getStudentProfile } from "./studentProfiles";
import { SUBJECT_GROUP_OFFERINGS } from "./academicCatalog";
import { encodeJournal, journalKey } from "./journalStore";
import { createSubjectLessons } from "./lessons";
import { calculateDashboardJournalMetrics } from "../domain/dashboard";
import type { Student } from "../components/Attendance/data/students";
import type { Assignment, Submission, SubmissionAttempt } from "./assignmentStore";

const subjectId = "theory-of-probability";
const groupId = "112-mko";
const studentId = "anna-smirnova";
const assignmentsKey = "bi-university-demo-assignments";
const submissionsKey = "bi-university-demo-submissions";
let saved: Map<string, string>;

const storeJournal = (students: Student[], subject = subjectId, group = groupId) =>
  saved.set(journalKey(subject, group), encodeJournal(students));
const assignment = (id: string, status: Assignment["status"] = "published"): Assignment => ({
  id, subjectId, groupId, subject: "Теория вероятностей", group: "112-МКо", title: id, description: "",
  lessonDate: "2026-09-07T12:10", lessonType: "Практика", deadline: "2026-09-15T12:00",
  status, allowLateSubmissions: false, createdAt: "2026-09-01T12:00", updatedAt: "2026-09-01T12:00",
});
const answer = (assignmentId: string, status: Submission["status"] = "submitted"): Submission => ({
  id: `answer-${assignmentId}`, assignmentId, studentId, studentName: "Анна Смирнова", status,
  sentAt: "2026-09-10T12:00", updatedAt: "2026-09-10T12:00", text: "Ответ",
});
const attempt = (number: number, status: SubmissionAttempt["status"]): SubmissionAttempt => ({
  id: `attempt-${number}`, number, status, sentAt: `2026-09-${10 + number}T12:00`,
  updatedAt: `2026-09-${10 + number}T12:00`, text: "Ответ", submittedLate: false,
});
const emptyStudent = (): Student => ({ id: studentId, name: "Анна Смирнова", attendance: {}, grades: {} });

beforeEach(() => {
  saved = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
  SUBJECT_GROUP_OFFERINGS.forEach((offering) => storeJournal([], offering.subjectId, offering.groupId));
  storeJournal([emptyStudent()]);
  saved.set(assignmentsKey, "[]");
  saved.set(submissionsKey, "[]");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("student profile academic metrics", () => {
  it("uses the dashboard calculation over saved completed journal lessons and refreshes after a save", () => {
    const lessons = createSubjectLessons(subjectId, groupId);
    const student: Student = {
      ...emptyStudent(),
      attendance: { [lessons[0].id]: "present", [lessons[1].id]: "absent" },
      grades: { [lessons[0].id]: 2, [lessons[1].id]: 5, [lessons[3].id]: 3 },
    };
    storeJournal([student]);
    const shared = calculateDashboardJournalMetrics([{ subjectId, groupId, students: [student], lessons }], studentId);
    expect(getStudentProfileMetrics(studentId, groupId)).toMatchObject({ averageGrade: shared.averageGrade, attendance: shared.attendance });
    expect(shared).toMatchObject({ averageGrade: 4, attendance: 50 });
    storeJournal([{ ...student, grades: { [lessons[1].id]: 2 }, attendance: { [lessons[0].id]: "absent" } }]);
    expect(getStudentProfileMetrics(studentId, groupId)).toMatchObject({ averageGrade: 2, attendance: 0 });
  });

  it("returns missing values for unmarked grades/attendance and counts an empty task set as 0/0", () => {
    expect(getStudentProfileMetrics(studentId, groupId)).toMatchObject({ averageGrade: null, attendance: null, completedWorks: 0, totalWorks: 0 });
  });

  it("does not invent metrics for a legacy contact absent from every journal", () => {
    expect(getStudentProfile("risk-anna-kuznetsova")?.name).toBe("Анна Кузнецова");
    expect(getStudentProfileMetrics("risk-anna-kuznetsova", groupId)).toMatchObject({ averageGrade: null, attendance: null, completedWorks: null, totalWorks: null });
    expect(getStudentProfileMetrics(studentId)).toMatchObject({ averageGrade: null, attendance: null, completedWorks: null, totalWorks: null });
  });

  it("counts submitted/graded latest attempts, excluding revision, drafts, archives and other groups/subjects", () => {
    saved.set(assignmentsKey, JSON.stringify([
      assignment("submitted"), assignment("graded", "closed"), assignment("revision"), assignment("missing"),
      assignment("draft", "draft"), assignment("archived", "archived"),
      { ...assignment("other-group"), groupId: "113-mko" }, { ...assignment("other-subject"), subjectId: "unknown-subject" },
    ]));
    saved.set(submissionsKey, JSON.stringify([
      answer("submitted"), answer("graded", "graded"), answer("revision", "revision"), answer("draft"),
      { ...answer("missing"), studentId: "other-student" },
    ]));
    expect(getStudentProfileMetrics(studentId, groupId)).toMatchObject({ completedWorks: 2, totalWorks: 4 });
  });

  it("uses attempt history over stale top-level status and never counts a task twice", () => {
    saved.set(assignmentsKey, JSON.stringify([assignment("task")]));
    saved.set(submissionsKey, JSON.stringify([
      { ...answer("task", "graded"), attempts: [attempt(1, "graded"), attempt(2, "revision")] },
    ]));
    expect(getStudentProfileMetrics(studentId, groupId).completedWorks).toBe(0);
    saved.set(submissionsKey, JSON.stringify([
      { ...answer("task", "revision"), attempts: [attempt(1, "revision"), attempt(2, "submitted")] },
      { ...answer("task", "graded"), updatedAt: "2026-09-01T12:00" },
    ]));
    expect(getStudentProfileMetrics(studentId, groupId)).toMatchObject({ completedWorks: 1, totalWorks: 1 });
  });

  it("does not turn corrupted journals into demo statistics and preserves stored bytes", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    saved.set(journalKey(subjectId, groupId), "broken-json");
    expect(getStudentProfileMetrics(studentId, groupId)).toMatchObject({ averageGrade: null, attendance: null, completedWorks: null });
    expect(saved.get(journalKey(subjectId, groupId))).toBe("broken-json");
    expect(log).toHaveBeenCalled();
  });

  it("does not publish a partial journal average when another subject is unreadable", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const lessons = createSubjectLessons(subjectId, groupId);
    storeJournal([{ ...emptyStudent(), grades: { [lessons[1].id]: 5 }, attendance: { [lessons[1].id]: "present" } }]);
    saved.set(journalKey("mathematical-statistics", groupId), "broken-json");
    saved.set(assignmentsKey, JSON.stringify([assignment("task")]));
    saved.set(submissionsKey, JSON.stringify([answer("task")]));
    expect(getStudentProfileMetrics(studentId, groupId)).toMatchObject({ averageGrade: null, attendance: null, completedWorks: 1, totalWorks: 1 });
  });

  it("reports unavailable metrics when browser storage denies access", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("Storage unavailable"); } });
    const metrics = getStudentProfileMetrics(studentId, groupId);
    expect(metrics).toMatchObject({ averageGrade: null, attendance: null, completedWorks: null, totalWorks: null });
    expect(metrics.error).not.toBe("");
  });

  it.each(["broken-json", "{}", "[null]"])("shows missing work counters for damaged assignment data: %s", (raw) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saved.set(assignmentsKey, raw);
    expect(getStudentProfileMetrics(studentId, groupId)).toMatchObject({ completedWorks: null, totalWorks: null });
    expect(saved.get(assignmentsKey)).toBe(raw);
  });

  it("does not report no submissions when submission storage is damaged", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    saved.set(assignmentsKey, JSON.stringify([assignment("task")]));
    saved.set(submissionsKey, "broken-json");
    expect(getStudentProfileMetrics(studentId, groupId)).toMatchObject({ completedWorks: null, totalWorks: null });
  });
});

describe("student profile identities", () => {
  it("resolves group-specific and added roster IDs, without trusting a name from a URL", () => {
    storeJournal([{ ...emptyStudent(), id: "113-mko-2", name: "Студент другой группы" }], subjectId, "113-mko");
    expect(getStudentProfile("113-mko-2")).toMatchObject({ name: "Студент другой группы", group: "113-МКо" });
    storeJournal([{ ...emptyStudent(), id: "new-student", name: "Добавленный студент" }]);
    expect(getStudentProfile("new-student", groupId)?.name).toBe("Добавленный студент");
    expect(getStudentProfile("new-student", "not-a-group")).toBeUndefined();
  });

  it("my group lists saved roster entries once and preserves old profile links", () => {
    const student = { ...emptyStudent(), name: "Изменённое имя" };
    storeJournal([student]);
    storeJournal([student], "mathematical-statistics");
    expect(getGroupStudentProfiles("112-МКо")).toHaveLength(1);
    expect(getStudentProfile(studentId)?.name).toBe("Изменённое имя");
    expect(getStudentProfile("1")?.id).toBe("1");
  });
});
