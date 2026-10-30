import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Assignment, Submission, SubmissionAttempt } from "../../../data/assignmentStore";
import { getAnswerDraftKey } from "../../../data/answerDraftStore";
import StudentAssignmentWorkspace from ".";

vi.mock("../../../hooks/useUnsavedChangesWarning", () => ({ default: () => {} }));

const assignment: Assignment = {
  id: "task", subjectId: "theory-of-probability", groupId: "112-mko", subject: "Теория вероятностей", group: "112-МКо",
  title: "Практикум", description: "Решите задачи и объясните вывод.", lessonDate: "2026-10-20T10:00",
  lessonType: "Практика", deadline: "2026-10-25T23:59", status: "published", allowLateSubmissions: false,
  createdAt: "2026-10-01T12:00", updatedAt: "2026-10-01T12:00",
};
const submission: Submission = {
  id: "answer", assignmentId: assignment.id, studentId: "anna-smirnova", studentName: "Анна Смирнова", text: "Моё решение",
  sentAt: "2026-10-20T12:00", updatedAt: "2026-10-20T12:00", status: "submitted",
};
const attempt: SubmissionAttempt = {
  id: "attempt-1", number: 1, status: "revision", teacherComment: "Пересчитайте вероятность в задаче 2.",
  text: submission.text, sentAt: submission.sentAt, updatedAt: submission.updatedAt, submittedLate: false,
};
let drafts: Map<string, string>;
const render = (task = assignment, answer?: Submission, saving = false) => renderToStaticMarkup(
  <StudentAssignmentWorkspace assignment={task} submission={answer} studentId="anna-smirnova" saving={saving} onSend={async () => true} />,
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00"));
  drafts = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => drafts.get(key) ?? null,
    setItem: (key: string, value: string) => drafts.set(key, value),
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("student assignment workspace", () => {
  it("starts with conditions and a required text answer, without a direct send bypass", () => {
    const markup = render();
    expect(markup.indexOf(assignment.description)).toBeLessThan(markup.indexOf("<textarea"));
    expect(markup).toContain("Подготовьте ответ");
    expect(markup).toContain("Проверить ответ");
    expect(markup).toContain("required=");
    expect(markup).not.toContain("Отправить преподавателю");
    expect(markup).not.toContain("Предыдущие попытки");
  });

  it("explains late admission and preserves the existing deadline policy", () => {
    const task = { ...assignment, deadline: "2026-10-20T12:00", allowLateSubmissions: true };
    expect(render(task)).toContain("отправленный после срока");
    expect(render(task)).toContain("<textarea");
    expect(render({ ...task, allowLateSubmissions: false })).not.toContain("<textarea");
    expect(render({ ...task, allowLateSubmissions: false })).toContain("Срок сдачи истёк");
  });

  it.each(["closed", "draft", "archived"] as const)("does not offer sending while assignment is %s", (status) => {
    const markup = render({ ...assignment, status });
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain("Проверить ответ");
    expect(markup).toContain("Ответ ещё не отправлен");
  });

  it("makes a submitted answer read-only while preserving the answer and its attachment", () => {
    const markup = render(assignment, { ...submission, attachmentId: "saved-file", attachmentName: "solution.pdf" });
    expect(markup).toContain("Ответ на проверке");
    expect(markup).toContain(submission.text);
    expect(markup).toContain("Скачать файл solution.pdf");
    expect(markup).not.toContain("<textarea");
  });

  it("offers both task and answer downloads even when filenames are missing", () => {
    const markup = render({ ...assignment, attachmentId: "task-file" }, { ...submission, attachmentId: "answer-file" });
    expect(markup).toContain("Скачать файл Файл задания");
    expect(markup).toContain("Скачать файл Вложение к ответу");
    expect(markup).not.toContain("<textarea");
  });

  it("shows the current revision comment once, before conditions, and offers correction", () => {
    const markup = render(assignment, { ...submission, attempts: [attempt] });
    expect(markup.split(attempt.teacherComment!).length - 1).toBe(1);
    expect(markup.indexOf(attempt.teacherComment!)).toBeLessThan(markup.indexOf(assignment.description));
    expect(markup).toContain("Исправить мою работу");
    expect(markup).toContain("<textarea");
    expect(markup).toContain("Ответ до исправления");
    expect(markup).not.toContain("<details open");
  });

  it("keeps revision feedback and answer accessible after admission closes, with no active composer", () => {
    const markup = render({ ...assignment, status: "closed" }, { ...submission, attempts: [attempt] });
    expect(markup).toContain("Преподаватель закрыл приём");
    expect(markup).toContain(attempt.teacherComment!);
    expect(markup).toContain(submission.text);
    expect(markup).not.toContain("<textarea");
  });

  it("renders a graded answer before its result, with older attempts collapsed afterwards", () => {
    const graded = { ...attempt, id: "attempt-2", number: 2, status: "graded" as const, grade: "5", teacherComment: "Верно", text: "Исправленное решение" };
    const markup = render(assignment, { ...submission, attempts: [attempt, graded] });
    expect(markup).toContain('aria-label="Оценка 5"');
    expect(markup.indexOf(graded.text)).toBeLessThan(markup.indexOf('aria-label="Результат проверки"'));
    expect(markup.indexOf('aria-label="Результат проверки"')).toBeLessThan(markup.indexOf("Предыдущие попытки"));
    expect(markup.split(graded.teacherComment).length - 1).toBe(1);
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain("<details open");
  });

  it("restores a tab draft and makes a lost file explicit without silently dropping it", () => {
    drafts.set(getAnswerDraftKey(submission.studentId, assignment.id), JSON.stringify({ text: "Сохранённый черновик", fileName: "lost.pdf" }));
    const markup = render();
    expect(markup).toContain("Сохранённый черновик");
    expect(markup).toContain("Текст сохранён до закрытия вкладки");
    expect(markup).toContain("Прикрепите «lost.pdf» заново");
    expect(markup).toContain("Продолжить без файла");
    expect(markup).toMatch(/<button type="submit"[^>]*disabled=""/);
  });

  it("retains an existing revision attachment unless the student explicitly replaces it", () => {
    const retained = { ...attempt, attachmentId: "old-file", attachmentName: "previous.pdf" };
    const markup = render(assignment, { ...submission, attempts: [retained] });
    expect(markup).toContain("Текущее вложение: previous.pdf");
    expect(markup).toContain("Без замены сохранится текущий файл.");
    expect(markup).toContain("Скачать файл previous.pdf");
  });

  it("reports an unreadable draft instead of claiming it was restored", () => {
    drafts.set(getAnswerDraftKey(submission.studentId, assignment.id), "broken-json");
    const markup = render();
    expect(markup).toContain("Не удалось восстановить черновик");
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("Текст сохранён до закрытия вкладки");
  });
  it("passes a storage failure as a reason to block sending while preserving copyable revision text", () => {
    const markup = renderToStaticMarkup(<StudentAssignmentWorkspace assignment={assignment} submission={{ ...submission, attempts: [attempt] }} studentId="anna-smirnova" saving={false} unavailableReason="Не удалось обновить данные задания." onSend={async () => true} />);
    expect(markup).toContain("Не удалось обновить данные задания"); expect(markup).toContain('aria-busy="false"');
    expect(markup).toMatch(/<textarea[^>]*readOnly=""/); expect(markup).not.toMatch(/<textarea[^>]*disabled=/); expect(markup).not.toContain("Отправляем");
    expect(markup).toContain(attempt.text); expect(markup).toContain(attempt.teacherComment!);
  });
});
