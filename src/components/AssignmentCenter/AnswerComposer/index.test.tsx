import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnswerComposer from ".";
import AnswerPreview from "./AnswerPreview";
import { getAnswerDraftKey } from "../../../data/answerDraftStore";
import type { SubmissionAttempt } from "../../../data/assignmentStore";

vi.mock("../../../hooks/useUnsavedChangesWarning", () => ({ default: () => undefined }));
let drafts: Map<string, string>;
let writes: ReturnType<typeof vi.fn>;
const onSend = vi.fn(async () => true);
const attempt: SubmissionAttempt = { id: "attempt-1", number: 1, status: "revision", text: "Исправляемый ответ", teacherComment: "Уточните расчёт", attachmentId: "previous-file", attachmentName: "previous.pdf", submittedLate: false, sentAt: "2026-10-20T12:00", updatedAt: "2026-10-20T12:00" };
const render = (patch = {}) => renderToStaticMarkup(<AnswerComposer studentId="student-1" assignmentId="task-1" assignmentVersion="v1" saving={false} onSend={onSend} {...patch} />);
const preview = (patch = {}) => renderToStaticMarkup(<AnswerPreview headingId="preview-title" headingRef={{ current: null }} text="Проверяемый ответ" attachment="solution.pdf · 2 КБ" busy={false} conditionsChanged={false} revising onEdit={() => undefined} onSend={() => undefined} {...patch} />);
beforeEach(() => {
  drafts = new Map(); writes = vi.fn(); onSend.mockClear();
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => drafts.get(key) ?? null, setItem: writes, removeItem: writes });
});
afterEach(() => vi.unstubAllGlobals());

describe("answer form admission and operation states", () => {
  it.each(["Преподаватель закрыл приём.", "Не удалось прочитать данные задания."])("keeps a tab draft keyboard-copyable without claiming a send: %s", (blockedReason) => {
    drafts.set(getAnswerDraftKey("student-1", "task-1"), JSON.stringify({ text: "Несданное решение" }));
    const html = render({ blockedReason });
    expect(html).toContain('aria-busy="false"'); expect(html).toMatch(/<textarea[^>]*readOnly=""/); expect(html).not.toMatch(/<textarea[^>]*disabled=/);
    expect(html).toContain("Несданное решение"); expect(html).toContain(blockedReason); expect(html).toContain("выделить и скопировать");
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Отправка недоступна/);
    expect(html).not.toContain("Отправляем"); expect(html).not.toContain("Ответ отправлен преподавателю"); expect(writes).not.toHaveBeenCalled(); expect(onSend).not.toHaveBeenCalled();
  });
  it("links the blocked reason to the read-only textarea and retains the existing revision file", () => {
    const html = render({ attempt, blockedReason: "Срок истёк." });
    const reasonId = html.match(/<p id="([^"]+)"[^>]*role="status"[^>]*>Срок истёк/)?.[1];
    expect(reasonId).toBeTruthy(); expect(html.match(/<textarea[^>]*aria-describedby="([^"]+)"/)?.[1].split(" ")).toContain(reasonId);
    expect(html).toContain(attempt.text); expect(html).toContain("Текущее вложение: previous.pdf"); expect(html).toContain("Без замены сохранится текущий файл");
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>.*?Заменить файл/); expect(writes).not.toHaveBeenCalled();
  });
  it("keeps a missing draft attachment explicit while blocking its dismissal during unavailable admission", () => {
    drafts.set(getAnswerDraftKey("student-1", "task-1"), JSON.stringify({ text: "Ответ", fileName: "lost.pdf" }));
    const html = render({ blockedReason: "Приём завершён." });
    expect(html).toContain("lost.pdf"); expect(html).toContain("сохранён только текст, не сам файл"); expect(html).toMatch(/<button type="button" disabled=""[^>]*>Продолжить без файла/);
  });

  it.each([undefined, "", " \t "])("shows an unnamed retained file and correctly describes discarding a lost replacement: %j", (attachmentName) => {
    drafts.set(getAnswerDraftKey("student-1", "task-1", attempt.id), JSON.stringify({ text: "Исправленный ответ", fileName: "lost-replacement.pdf" }));
    const html = render({ attempt: { ...attempt, attachmentName } });
    expect(html).toContain("Текущее вложение: Вложение к ответу");
    expect(html).toContain("Без замены сохранится текущий файл.");
    expect(html).toContain("Заменить файл");
    expect(html).toContain("lost-replacement.pdf");
    expect(html).toMatch(/<button type="button"[^>]*>Оставить прежнее вложение<\/button>/);
    expect(html).not.toContain("Продолжить без файла");
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""/);
    expect(writes).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not promise retaining a file when the previous attempt has only a filename", () => {
    drafts.set(getAnswerDraftKey("student-1", "task-1", attempt.id), JSON.stringify({ text: "Ответ", fileName: "lost.pdf" }));
    const html = render({ attempt: { ...attempt, attachmentId: undefined } });
    expect(html).toContain("Продолжить без файла");
    expect(html).toContain("Прикрепить файл");
    expect(html).not.toContain("Текущее вложение");
    expect(html).not.toContain("Без замены сохранится текущий файл");
    expect(html).not.toContain("Оставить прежнее вложение");
  });
  it("still exposes an editable draft and a real preview action when admission is available", () => {
    drafts.set(getAnswerDraftKey("student-1", "task-1"), JSON.stringify({ text: "Ответ" })); const html = render();
    expect(html).not.toMatch(/<textarea[^>]*(?:readOnly|disabled)=/); expect(html).toMatch(/<button type="submit"(?![^>]*disabled)[^>]*>Проверить ответ/);
    expect(html).not.toContain("Отправка недоступна"); expect(html).toContain("Текст сохранён до закрытия вкладки");
  });
  it("uses aria-busy and temporary disabling for an actual operation instead of a closed-admission explanation", () => {
    const html = render({ saving: true }); expect(html).toContain('aria-busy="true"'); expect(html).toMatch(/<textarea[^>]*disabled=""/); expect(html).not.toContain("Отправка недоступна");
  });
});

describe("answer preview admission changes", () => {
  it("keeps the prepared answer and filename visible when admission closes, and allows return for copying", () => {
    const html = preview({ blockedReason: "Приём завершён." });
    expect(html).toContain("Проверяемый ответ"); expect(html).toContain("solution.pdf"); expect(html).not.toContain("Отправляем");
    expect(html).toMatch(/<button type="button"(?![^>]*disabled)[^>]*>К тексту ответа/);
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Отправка недоступна/);
  });
  it("shows sending only during a real operation, including when admission also changed", () => {
    const html = preview({ busy: true, blockedReason: "Приём завершён." }); expect(html).toContain("Отправляем…");
    expect((html.match(/<button[^>]*disabled=""/g) ?? []).length).toBe(2);
  });
  it("blocks stale conditions without pretending that sending has started", () => {
    const html = preview({ conditionsChanged: true }); expect(html).toContain("Преподаватель изменил условия"); expect(html).not.toContain("Отправляем");
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Отправить повторно/); expect(html).toMatch(/<button type="button"(?![^>]*disabled)[^>]*>Редактировать/);
  });
  it.each([true, false])("preserves the existing send label for an available preview, revising=%s", (revising) => {
    const html = preview({ revising }); expect(html).toContain(revising ? "Отправить повторно" : "Отправить преподавателю"); expect(html).not.toContain("disabled=");
  });
});
