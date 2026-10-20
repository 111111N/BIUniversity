import { describe, expect, it } from "vitest";
import type { Assignment, Submission, SubmissionAttempt } from "../data/assignmentStore";
import { calculateTeacherAnalytics, type AnalyticsJournal, type AnalyticsRange } from "./teacherAnalytics";

const range: AnalyticsRange = {
  start: new Date("2026-10-05T00:00:00+03:00"),
  end: new Date("2026-10-11T23:59:59.999+03:00"),
};
const journal: AnalyticsJournal = {
  subjectId: "subject-1", subjectName: "Subject", subjectShortName: "S",
  groupId: "group-1", groupName: "Group",
  students: [{ id: "student-1", name: "Student", attendance: {}, grades: {} }],
  lessons: [],
};
const assignment = (overrides: Partial<Assignment> = {}): Assignment => ({
  id: "task-1", subjectId: journal.subjectId, groupId: journal.groupId,
  subject: journal.subjectName, group: journal.groupName, lessonDate: "2026-10-05T09:00:00+03:00",
  lessonType: "Практика", title: "Task", description: "Description",
  deadline: "2026-10-07T23:59:00+03:00", status: "published", allowLateSubmissions: true,
  createdAt: "2026-10-04T10:00:00+03:00", updatedAt: "2026-10-04T10:00:00+03:00", ...overrides,
});
const attempt = (overrides: Partial<SubmissionAttempt> = {}): SubmissionAttempt => ({
  id: "attempt-1", number: 1, sentAt: "2026-10-06T12:00:00+03:00",
  updatedAt: "2026-10-06T12:00:00+03:00", text: "Answer", status: "submitted", submittedLate: false,
  ...overrides,
});
const submission = (attempts: SubmissionAttempt[], overrides: Partial<Submission> = {}): Submission => ({
  id: "answer-1", assignmentId: "task-1", studentId: "student-1", studentName: "Student",
  sentAt: attempts[0]?.sentAt ?? "2026-10-06T12:00:00+03:00",
  updatedAt: attempts.at(-1)?.updatedAt ?? "2026-10-06T12:00:00+03:00",
  text: "Answer", status: attempts.at(-1)?.status ?? "submitted", attempts, ...overrides,
});
const returnedAttempt = () => attempt({
  status: "revision", reviewedAt: "2026-10-08T12:00:00+03:00", updatedAt: "2026-10-08T12:00:00+03:00",
});
const futureAttempt = () => attempt({
  id: "attempt-2", number: 2, sentAt: "2026-10-12T12:00:00+03:00",
  updatedAt: "2026-10-12T12:00:00+03:00",
});
const calculate = (answers: Submission[], tasks = [assignment()], period = range) =>
  calculateTeacherAnalytics([journal], tasks, answers, period);

describe("teacher analytics submission history", () => {
  it("keeps the first submitted answer in a past week when its resubmission happened later", () => {
    expect(calculate([submission([returnedAttempt(), futureAttempt()])]).work).toEqual({
      assignments: 1, expected: 1, received: 1, onTime: 1, waiting: 0, revision: 1, graded: 0, overdue: 0,
    });
  });

  it.each(["graded", "revision"] as const)("shows a %s answer as waiting until its review exists", (status) => {
    const answer = submission([attempt({
      status, grade: status === "graded" ? "5" : undefined,
      reviewedAt: "2026-10-14T12:00:00+03:00", updatedAt: "2026-10-14T12:00:00+03:00",
    })]);
    expect(calculate([answer]).work).toMatchObject({ received: 1, waiting: 1, graded: 0, revision: 0, overdue: 0 });
  });

  it("uses the latest existing attempt and its review for a current period", () => {
    const latest = futureAttempt();
    latest.status = "graded";
    latest.reviewedAt = latest.updatedAt = "2026-10-14T12:00:00+03:00";
    const result = calculate([submission([returnedAttempt(), latest])], [assignment()], {
      ...range, end: new Date("2026-10-20T12:00:00+03:00"),
    });
    expect(result.work).toMatchObject({ received: 1, onTime: 1, waiting: 0, revision: 0, graded: 1, overdue: 0 });
  });

  it("does not rely on attempt array order for the latest status or the original on-time answer", () => {
    const later = attempt({
      id: "attempt-2", number: 2, sentAt: "2026-10-09T12:00:00+03:00",
      updatedAt: "2026-10-09T12:00:00+03:00", submittedLate: true,
    });
    expect(calculate([submission([later, returnedAttempt()])]).work).toMatchObject({
      received: 1, onTime: 1, waiting: 1, revision: 0,
    });
  });

  it("uses the attempt number to break ties for matching submission times", () => {
    const later = attempt({ id: "attempt-2", number: 2 });
    expect(calculate([submission([later, returnedAttempt()])]).work).toMatchObject({ waiting: 1, revision: 0 });
  });

  it("includes submissions exactly at the end of the period and deadline", () => {
    const timestamp = range.end.toISOString();
    expect(calculate([submission([attempt({ sentAt: timestamp, updatedAt: timestamp })])], [assignment({ deadline: timestamp })]).work)
      .toMatchObject({ received: 1, onTime: 1, waiting: 1, overdue: 0 });
  });

  it("excludes submissions one millisecond after the end", () => {
    const timestamp = new Date(range.end.getTime() + 1).toISOString();
    expect(calculate([submission([attempt({ sentAt: timestamp, updatedAt: timestamp })])]).work)
      .toMatchObject({ received: 0, onTime: 0, waiting: 0, overdue: 1 });
  });

  it.each([0, 1])("applies reviews at the period boundary with offset %i ms", (offset) => {
    const timestamp = new Date(range.end.getTime() + offset).toISOString();
    expect(calculate([submission([attempt({ status: "graded", reviewedAt: timestamp, updatedAt: timestamp })])]).work)
      .toMatchObject({ graded: offset === 0 ? 1 : 0, waiting: offset === 0 ? 0 : 1 });
  });

  it("does not mark missing answers overdue until after the deadline", () => {
    expect(calculate([], [assignment({ deadline: range.end.toISOString() })]).work.overdue).toBe(0);
    expect(calculate([], [assignment({ deadline: new Date(range.end.getTime() - 1).toISOString() })]).work.overdue).toBe(1);
  });

  it("keeps assignment selection based on lesson date and includes answers sent before the period", () => {
    const timestamp = "2026-10-04T12:00:00+03:00";
    const result = calculate([submission([attempt({ sentAt: timestamp, updatedAt: timestamp })])], [
      assignment(), assignment({ id: "before", lessonDate: timestamp }),
      assignment({ id: "after", lessonDate: "2026-10-12T09:00:00+03:00" }),
    ]);
    expect(result.work).toMatchObject({ assignments: 1, expected: 1, received: 1, onTime: 1 });
  });

  it("falls back to updatedAt for legacy reviews without an attempt history", () => {
    const answer = submission([], { status: "graded", updatedAt: "2026-10-14T12:00:00+03:00" });
    expect(calculate([answer]).work).toMatchObject({ received: 1, waiting: 1, graded: 0 });
    expect(calculate([answer], [assignment()], { ...range, end: new Date("2026-10-15T12:00:00+03:00") }).work)
      .toMatchObject({ received: 1, waiting: 0, graded: 1 });
  });

  it("preserves legacy statuses when updatedAt and sentAt coincide", () => {
    expect(calculate([submission([], { status: "graded" })]).work).toMatchObject({ received: 1, graded: 1, waiting: 0 });
  });

  it("uses updatedAt for legacy attempts without reviewedAt", () => {
    expect(calculate([submission([attempt({ status: "revision", updatedAt: "2026-10-08T12:00:00+03:00" })])]).work)
      .toMatchObject({ received: 1, revision: 1, waiting: 0 });
  });

  it("ignores attempts with invalid submission dates", () => {
    const invalid = attempt({ id: "invalid", number: 3, sentAt: "invalid" });
    expect(calculate([submission([invalid])]).work).toMatchObject({ received: 0, onTime: 0, overdue: 1 });
    expect(calculate([submission([returnedAttempt(), invalid])]).work).toMatchObject({ received: 1, onTime: 1, revision: 1 });
  });

  it.each(["invalid", "2026-10-05T12:00:00+03:00"])("does not invent a review date for an invalid timestamp: %s", (reviewedAt) => {
    expect(calculate([submission([attempt({ status: "graded", reviewedAt })])]).work)
      .toMatchObject({ received: 1, waiting: 1, graded: 0 });
  });

  it.each([true, false])("uses historical attempts for overdue risks (existing earlier answer: %s)", (hasPastAnswer) => {
    const tasks = [assignment(), assignment({ id: "task-2" })];
    const attempts = hasPastAnswer ? [returnedAttempt(), futureAttempt()] : [futureAttempt()];
    const answers = tasks.map((task) => submission(attempts, { id: `answer-${task.id}`, assignmentId: task.id }));
    const result = calculate(answers, tasks);
    expect(result.risks).toHaveLength(1);
    expect(result.risks[0].overdue).toBe(2);
    expect(result.work).toMatchObject({ received: hasPastAnswer ? 2 : 0, revision: hasPastAnswer ? 2 : 0, overdue: hasPastAnswer ? 0 : 2 });
  });

  it("does not count reviews after the period towards overdue risks", () => {
    const tasks = [assignment(), assignment({ id: "task-2" })];
    const answers = tasks.map((task) => submission([
      attempt({ status: "revision", reviewedAt: "2026-10-14T12:00:00+03:00" }),
    ], { id: `answer-${task.id}`, assignmentId: task.id }));
    const result = calculate(answers, tasks);
    expect(result.work.waiting).toBe(2);
    expect(result.risks).toEqual([]);
  });
});
