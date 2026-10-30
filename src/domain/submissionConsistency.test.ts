import { describe, expect, it } from "vitest";
import { learningBackupFixture } from "../testSupport/localBackupDocuments";
import { getSubmissionConsistencyIssues } from "./submissionConsistency";

const answer = () => learningBackupFixture().submissions[0];

describe("archived submission consistency", () => {
  it("keeps a coherent workflow unchanged and exposes no private text", () => {
    const submission = answer(); const before = JSON.stringify(submission);
    expect(getSubmissionConsistencyIssues(submission)).toEqual([]);
    expect(JSON.stringify(submission)).toBe(before);
  });

  it.each([
    ["text", "PRIVATE CONFLICTING ANSWER", "текст ответа"],
    ["status", "revision", "состояние"],
    ["attachmentId", "PRIVATE FILE ID", "ID вложения"],
    ["attachmentName", "PRIVATE FILE NAME", "имя вложения"],
    ["teacherComment", "PRIVATE FEEDBACK", "комментарий преподавателя"],
    ["grade", "5", "оценка"],
    ["updatedAt", "2026-10-29T12:00", "дата обновления"],
  ])("reports a conflicting %s by field name without copying its value", (field, value, label) => {
    const submission = answer(); Object.assign(submission, { [field]: value });
    const issues = getSubmissionConsistencyIssues(submission);
    expect(issues).toContainEqual(expect.objectContaining({ level: "error", code: "latest-attempt-mismatch", message: expect.stringContaining(label) }));
    expect(JSON.stringify(issues)).not.toContain("PRIVATE");
  });

  it("groups multiple conflicting mirror fields into one finding", () => {
    const submission = answer(); Object.assign(submission, { text: "other", status: "revision", grade: "5" });
    const issues = getSubmissionConsistencyIssues(submission);
    expect(issues).toHaveLength(1); expect(issues[0].message).toContain("текст ответа, состояние, оценка");
  });

  it("keeps missing optional mirrors compatible with history-only legacy records", () => {
    const submission = answer();
    const legacy = { id: submission.id, assignmentId: submission.assignmentId, studentId: submission.studentId, studentName: submission.studentName, sentAt: submission.sentAt, attempts: submission.attempts };
    expect(getSubmissionConsistencyIssues(legacy)).toEqual([]);
  });

  it("does not compare the obsolete legacy comment against a structured review", () => {
    const submission = answer(); submission.comment = "PRIVATE OLD COMMENT";
    expect(getSubmissionConsistencyIssues(submission)).toEqual([]);
  });

  it("uses the first attempt for workflow sentAt and the latest for updatedAt", () => {
    const submission = answer();
    submission.attempts![0].status = "revision";
    submission.attempts!.push({ ...submission.attempts![0], id: "second", number: 2, status: "submitted", sentAt: "2026-10-29T12:00", updatedAt: "2026-10-29T12:00" });
    submission.attemptCount = 2; submission.updatedAt = "2026-10-29T12:00";
    expect(getSubmissionConsistencyIssues(submission)).toEqual([]);
    submission.sentAt = "2026-10-29T12:00";
    expect(getSubmissionConsistencyIssues(submission)).toContainEqual(expect.objectContaining({ code: "first-attempt-date-mismatch" }));
  });

  it("compares timestamps by instant, accepting equivalent offsets", () => {
    const submission = answer(); submission.sentAt = "2026-10-28T12:00:00+03:00"; submission.updatedAt = submission.sentAt;
    submission.attempts![0].sentAt = "2026-10-28T09:00:00Z"; submission.attempts![0].updatedAt = "2026-10-28T09:00:00Z";
    expect(getSubmissionConsistencyIssues(submission)).toEqual([]);
  });

  it("reports a conflicting structured count", () => {
    const submission = answer(); submission.attemptCount = 2;
    expect(getSubmissionConsistencyIssues(submission)).toContainEqual(expect.objectContaining({ level: "error", code: "attempt-count-mismatch" }));
  });

  it.each([{ attempts: undefined }, { attempts: [] }])("accepts legacy answers without populated attempt history: $attempts", ({ attempts }) => {
    const submission = answer(); submission.attempts = attempts;
    expect(getSubmissionConsistencyIssues(submission)).toEqual([]);
    submission.attemptCount = undefined;
    expect(getSubmissionConsistencyIssues(submission)).toEqual([]);
  });

  it.each([{ attempts: undefined }, { attempts: [] }])("marks an unverifiable legacy count for review instead of inventing missing attempts: $attempts", ({ attempts }) => {
    const submission = answer(); submission.attempts = attempts; submission.attemptCount = 3;
    const before = JSON.stringify(submission);
    expect(getSubmissionConsistencyIssues(submission)).toEqual([expect.objectContaining({ level: "review", code: "unverified-attempt-count" })]);
    expect(JSON.stringify(submission)).toBe(before);
  });

  it.each(["2026-10-28T11:00", "2026-10-28T13:00"])("flags review time outside the attempt interval: %s", (reviewedAt) => {
    const submission = answer(); submission.attempts![0].reviewedAt = reviewedAt;
    expect(getSubmissionConsistencyIssues(submission)).toContainEqual(expect.objectContaining({ code: "attempt-review-time-1", level: "error" }));
  });

  it("accepts valid review time and older reviews without reviewedAt", () => {
    const submission = answer(); const attempt = submission.attempts![0];
    attempt.reviewedAt = attempt.sentAt;
    expect(getSubmissionConsistencyIssues(submission)).toEqual([]);
    delete attempt.reviewedAt;
    expect(getSubmissionConsistencyIssues(submission)).toEqual([]);
  });
});
