import { createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Submission } from "../../../data/assignmentStore";
import SubmissionWorkspace from ".";
import type { SubmissionReviewView } from "../../../domain/submissionReviewNavigation";

const defaultView: SubmissionReviewView = { filter: "all", query: "", sort: "queue", pane: "list" };
const render = (answers: Submission[], props: Partial<ComponentProps<typeof SubmissionWorkspace>> = {}) => renderToStaticMarkup(<MemoryRouter><SubmissionWorkspace answers={answers} students={[]} rosterError="" currentId={null} targetRef={createRef()} saving={false} drafts={{}} view={defaultView} onViewChange={() => {}} onDraftChange={() => {}} onSelect={() => {}} onReview={() => true} {...props} /></MemoryRouter>);
const answer: Submission = { id: "one", studentId: "anna", studentName: "Анна", assignmentId: "task", text: "Первый ответ", sentAt: "2026-09-12T12:00", updatedAt: "2026-09-12T12:00", status: "revision", teacherComment: "Исправить" };
const pending: Submission = { ...answer, id: "two", studentId: "ivan", studentName: "Иван", status: "submitted", text: "Второй ответ" };

describe("submission workspace", () => {
  it("shows a useful empty state without an empty queue", () => {
    const markup = render([]);
    expect(markup).toContain("Ответов пока нет");
    expect(markup).not.toContain("Очередь проверки");
    expect(markup).not.toContain('data-submission-id=');
  });

  it("counts revision as considered without marking it graded", () => {
    const markup = render([answer]);
    expect(markup).toContain("Новых работ для проверки нет");
    expect(markup).toContain("Рассмотрено 1 / 1");
    expect(markup).toContain('value="1"');
    expect(markup).toContain("На доработке");
    expect(markup).not.toContain("Сохранить и далее");
  });

  it("shows roster errors without inventing a missing-student count", () => {
    const markup = render([], { rosterError: "storage failure" });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Список несдавших временно недоступен");
    expect(markup).toMatch(/Не сдали<span>—<\/span>/);
    expect(markup).not.toMatch(/Не сдали<span>0<\/span>/);
  });

  it("renders exactly one answer, selecting a pending work before reviewed work", () => {
    const markup = render([answer, pending]);
    expect(markup.match(/data-submission-id=/g)).toHaveLength(1);
    expect(markup).toContain('data-submission-id="two"');
    expect(markup).toContain("Второй ответ");
    expect(markup).not.toContain("Первый ответ");
    expect(markup).not.toContain("Раскрыть ответ");
    expect(markup).not.toContain("Свернуть ответ");
    expect(markup).toContain("К списку работ");
  });

  it("opens a linked answer even when the initial submitted filter excludes it", () => {
    const markup = render([answer, pending], { currentId: answer.id, view: { ...defaultView, filter: "submitted", pane: "answer" } });
    expect(markup).toContain('data-submission-id="one"');
    expect(markup).toContain("Первый ответ");
    expect(markup).toContain("Выбранная работа вне текущего списка");
    expect(markup).not.toContain("Второй ответ");
    expect(markup).toMatch(/aria-pressed="true"[^>]*>На проверке/);
  });

  it("restores the draft for the selected attempt without displaying another student's draft", () => {
    const markup = render([pending], {
      drafts: { "two-attempt-1": { comment: "Сохранённый черновик", grade: "4" }, other: { comment: "Чужой черновик", grade: "2" } },
    });
    expect(markup).toContain("Сохранённый черновик");
    expect(markup).not.toContain("Чужой черновик");
    expect(markup).toMatch(/type="radio"[^>]*aria-label="Оценка 4 для Иван"[^>]*checked=""/);
    expect(markup).toContain("Есть черновик");
  });

  it.each([{ answers: [answer, pending] }, { answers: [] }])("does not replace an unavailable linked answer with another student's work (%#)", ({ answers }) => {
    const markup = render(answers, {
      currentId: "unavailable",
      view: { ...defaultView, filter: "submitted", pane: "answer" },
      drafts: { "two-attempt-1": { comment: "Чужой черновик", grade: "4" } },
    });
    expect(markup).toContain("Работа недоступна");
    expect(markup).toContain("К доступным работам");
    expect(markup).not.toContain("data-submission-id=");
    expect(markup).not.toContain("Первый ответ");
    expect(markup).not.toContain("Второй ответ");
    expect(markup).not.toContain("Чужой черновик");
    expect(markup).not.toContain('aria-current="true"');
    expect(markup).not.toContain("Сохранить и далее");
  });

  it("preserves the list of available works beside an unavailable link", () => {
    const markup = render([pending], { currentId: "unavailable" });
    expect(markup).toContain("Работа недоступна");
    expect(markup).toContain("Иван");
    expect(markup).toContain('type="search"');
    expect(markup).not.toContain("placeholder=");
  });

  it("keeps student navigation available and the review draft copyable during a storage error", () => {
    const markup = render([pending], {
      unavailableReason: "Ошибка чтения работ.",
      drafts: { "two-attempt-1": { comment: "Мой комментарий", grade: "4" } },
    });
    expect(markup).toContain("Сохранение недоступно. Ошибка чтения работ.");
    expect(markup).toContain("Мой комментарий</textarea>");
    expect(markup).toContain('aria-busy="false"');
    expect(markup).toMatch(/<textarea[^>]*readOnly=""/);
    expect(markup).not.toMatch(/<textarea[^>]*disabled=/);
    expect(markup).not.toMatch(/<input[^>]*type="search"[^>]*disabled=/);
    expect(markup).not.toMatch(/<select[^>]*disabled=/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*aria-pressed=/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*data-status=/);
    expect(markup).not.toContain("Сохраняем");
  });

  it("keeps missing students in a separate list mode instead of a long block after answers", () => {
    const markup = render([pending], { students: [{ id: "missing", name: "Не сдавший студент", attendance: {}, grades: {} }] });
    expect(markup).toMatch(/Не сдали<span>1<\/span>/);
    expect(markup).not.toContain("Не сдавший студент");
    expect(markup).not.toContain("Ещё не сдали");
  });

  it("renders restored search, status and order instead of resetting the queue", () => {
    const markup = render([answer, pending], { currentId: pending.id, view: { filter: "submitted", query: "Иван", sort: "name", pane: "list" } });
    expect(markup).toMatch(/type="search"[^>]*value="Иван"/);
    expect(markup).toMatch(/value="name" selected=""/);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>На проверке/);
    expect(markup).toContain('data-submission-id="two"');
    expect(markup).not.toContain("Первый ответ");
    expect(markup).not.toContain("Анна");
  });

  it("restores missing-student cards without showing the previously selected answer", () => {
    const markup = render([pending], {
      groupId: "group", currentId: pending.id, view: { filter: "missing", query: "Не сдавший", sort: "name", pane: "list" },
      students: [{ id: "missing", name: "Не сдавший студент", attendance: {}, grades: {} }],
    });
    expect(markup).toContain("Не сдавший студент");
    expect(markup).toContain("Открыть профиль: Не сдавший студент");
    expect(markup).not.toContain("data-submission-id=");
    expect(markup).not.toContain("Второй ответ");
  });

  it("keeps the whole assignment's pending count and progress when search only finds a reviewed answer", () => {
    const markup = render([answer, pending], { currentId: answer.id, view: { filter: "all", query: "Анна", sort: "queue", pane: "list" } });
    expect(markup).toContain("На проверке: 1");
    expect(markup).not.toContain("Новых работ для проверки нет");
    expect(markup).toContain("Рассмотрено 1 / 2");
    expect(markup).toMatch(/<progress max="2" value="1"/);
    expect(markup).toContain("Найдено в этом разделе: 1");
    expect(markup).toMatch(/На проверке<span>0<\/span>/);
  });

  it("does not describe an empty search result as an empty review queue", () => {
    const markup = render([pending], { view: { filter: "submitted", query: "Нет совпадений", sort: "queue", pane: "list" } });
    expect(markup).toContain("На проверке: 1");
    expect(markup).toContain("Рассмотрено 0 / 1");
    expect(markup).toContain("Найдено в этом разделе: 0");
    expect(markup).toContain("Ответы не найдены");
    expect(markup).toContain('aria-label="Очистить поиск по студентам"');
    expect(markup).not.toContain("Новых работ для проверки нет");
    expect(markup).not.toContain(">Все статусы</button>");
  });

  it("offers all statuses only when they contain works matching the current search", () => {
    const markup = render([answer, pending], { view: { filter: "submitted", query: "Анна", sort: "name", pane: "list" } });
    expect(markup).toContain("Найдено в этом разделе: 0");
    expect(markup).toContain(">Все статусы</button>");
    expect(markup).toMatch(/type="search"[^>]*value="Анна"/);
    expect(markup).toMatch(/value="name" selected=""/);
  });

  it("keeps whitespace-only search clearable without announcing a restricted result count", () => {
    const markup = render([pending], { view: { ...defaultView, query: "   " } });
    expect(markup).toContain('aria-label="Очистить поиск по студентам"');
    expect(markup).not.toContain("Найдено в этом разделе");
    expect(markup).toContain("На проверке: 1");
  });

  it("does not invent a missing-student search count when the roster is unavailable", () => {
    const markup = render([pending], { rosterError: "Ошибка чтения.", view: { filter: "missing", query: "Анна", sort: "queue", pane: "list" } });
    expect(markup).toContain("Список несдавших временно недоступен");
    expect(markup).not.toContain("Найдено в этом разделе");
    expect(markup).toContain('aria-label="Очистить поиск по студентам"');
  });

  it("blocks search clearing and status reset during a real save", () => {
    const markup = render([answer], { saving: true, view: { filter: "submitted", query: "Анна", sort: "name", pane: "list" } });
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Очистить поиск по студентам"/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Все статусы/);
  });
});
