import { describe, expect, it } from "vitest";
import type { Submission, SubmissionStatus } from "../data/assignmentStore";
import { getNextReviewSubmission, getReviewSubmissions } from "./submissionReview";
import { matchesSearchText } from "./search";

const answer = (id: string, studentName: string, status: SubmissionStatus = "submitted", sentAt = "2026-09-12T12:00"): Submission => ({ id, studentName, status, sentAt, assignmentId: "task", studentId: id, updatedAt: sentAt, text: "Ответ" });
const ids = (items: Submission[]) => items.map((item) => item.id);

describe("submission review queue", () => {
  const answers = [answer("graded", "Анна Смирнова", "graded"), answer("new", "Иван Иванов", "submitted", "2026-09-13T12:00"), answer("old", "Елена Козлова"), answer("revision", "Мария Петрова", "revision")];

  it("puts awaiting answers first, oldest first, without mutating the source", () => {
    expect(ids(getReviewSubmissions(answers))).toEqual(["old", "new", "revision", "graded"]);
    expect(ids(answers)).toEqual(["graded", "new", "old", "revision"]);
  });

  it("matches all query words regardless of order, case, ё or whitespace", () => {
    expect(matchesSearchText("Алёна Смирнова", "  СМИРНОВА алена ")).toBe(true);
    expect(matchesSearchText("Алёна Смирнова", "алена иванова")).toBe(false);
    expect(matchesSearchText("Ответ", "  ")).toBe(true);
  });

  it("combines status and name filters", () => {
    expect(ids(getReviewSubmissions(answers, "submitted", "Иванов"))).toEqual(["new"]);
    expect(getReviewSubmissions(answers, "submitted", "Смирнова")).toEqual([]);
  });

  it("uses the latest attempt's date and status rather than stale workflow fields", () => {
    const resubmitted = { ...answers[0], attempts: [
      { id: "first", number: 1, sentAt: "2026-09-12T12:00", updatedAt: "2026-09-12T12:00", text: "Первый", status: "revision" as const, submittedLate: false },
      { id: "second", number: 2, sentAt: "2026-09-14T12:00", updatedAt: "2026-09-14T12:00", text: "Второй", status: "submitted" as const, submittedLate: false },
    ] };
    expect(ids(getReviewSubmissions([resubmitted, answers[1]], "submitted", "", "newest"))).toEqual(["graded", "new"]);
    expect(ids(getReviewSubmissions([resubmitted, answers[1]], "submitted", "", "oldest"))).toEqual(["new", "graded"]);
  });

  it("sorts by Russian names", () => {
    expect(ids(getReviewSubmissions(answers, "all", "", "name"))).toEqual(["graded", "old", "new", "revision"]);
  });

  it("starts at the first pending answer and wraps without reviewed answers", () => {
    expect(getNextReviewSubmission(answers)?.id).toBe("old");
    expect(getNextReviewSubmission(answers, "old")?.id).toBe("new");
    expect(getNextReviewSubmission(answers, "new")?.id).toBe("old");
    expect(getNextReviewSubmission(answers, "graded")?.id).toBe("old");
  });

  it("respects the search and selected sort when advancing", () => {
    expect(getNextReviewSubmission(answers, null, "Иванов")?.id).toBe("new");
    expect(getNextReviewSubmission(answers, "new", "Иванов")).toBeNull();
    expect(getNextReviewSubmission(answers, null, "", "newest")?.id).toBe("new");
  });

  it("returns null when nothing remains or the last pending answer is current", () => {
    expect(getNextReviewSubmission([], "unknown")).toBeNull();
    expect(getNextReviewSubmission([answers[0], answers[3]])).toBeNull();
    expect(getNextReviewSubmission([answers[1]], "new")).toBeNull();
  });
});
