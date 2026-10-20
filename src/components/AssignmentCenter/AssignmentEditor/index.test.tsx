import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getAssignmentFormError, type AssignmentForm } from "../../../domain/assignmentForm";
import { RoleProvider } from "../../RoleContext";
import AssignmentEditor, { type Props } from ".";

const form: AssignmentForm = {
  subject: "Теория вероятностей", group: "112-МКо", lessonDate: "2026-10-20T09:00", lessonType: "Практика",
  title: "Условная вероятность", description: "Решите задачи и объясните ход решения.", deadline: "2026-10-23T23:59", status: "published", allowLateSubmissions: false,
};
const props: Props = {
  form, onChange: () => {}, onSubmit: () => {}, onSaveDraft: () => {}, onCancel: () => {}, editing: false,
  saving: false, dirty: false, error: "", file: null, onFileChange: () => {}, subjectLocked: true, groupLocked: true,
  formRef: createRef(), titleRef: createRef(), errorRef: createRef(),
};
const render = (overrides: Partial<Props> = {}) => renderToStaticMarkup(<RoleProvider><AssignmentEditor {...props} {...overrides} /></RoleProvider>);

describe("assignment editor", () => {
  it("shows a dedicated editor with locked journal context and no duplicate selectors", () => {
    const markup = render();
    expect(markup).toContain("Новое задание");
    expect(markup).toContain("Теория вероятностей · Группа 112-МКо");
    expect(markup).not.toContain('aria-label="Дисциплина"');
    expect(markup).not.toContain('aria-label="Группа"');
    expect(markup).not.toContain("Дополнительные параметры");
    expect(markup).toContain('type="submit"');
    expect(markup).toContain("Предпросмотр");
    expect(markup).toContain("Сохранить черновик");
    expect((markup.match(/<fieldset/g) ?? []).length).toBe(3);
  });

  it("offers scope selectors outside a locked journal", () => {
    const markup = render({ subjectLocked: false, groupLocked: false });
    expect(markup).toContain('aria-label="Дисциплина"');
    expect(markup).toContain('aria-label="Группа"');
    expect(markup).not.toContain("Теория вероятностей · Группа 112-МКо");
  });

  it("keeps lifecycle controls in advanced parameters and draft saving available for the original draft", () => {
    const markup = render({ editing: true, originalStatus: "published" });
    expect(markup).toContain("Редактирование задания");
    expect(markup).toContain("Дополнительные параметры");
    expect(markup).toContain('aria-label="Состояние задания после сохранения"');
    expect(markup).not.toContain("Сохранить черновик");
    const draft = render({ editing: true, originalStatus: "draft" });
    expect(draft).toContain("Сохранить черновик");
    for (const status of ["draft", "published", "closed", "archived"] as const) {
      const state = render({ editing: true, originalStatus: status, form: { ...form, status } });
      expect(state).toContain('aria-label="Состояние задания после сохранения"');
      if (status === "draft") expect(state).not.toContain("Сохранить черновик</button>");
    }
  });

  it("associates existing validation failures with the affected text fields", () => {
    const invalid = { ...form, title: "  ", description: " " };
    const error = getAssignmentFormError(invalid, [{ subjectId: "theory-of-probability", groupIds: ["112-mko"] }]);
    const markup = render({ form: invalid, error });
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toMatch(/<input[^>]*aria-describedby="[^"]+-title-error"/);
    expect(markup).toMatch(/<textarea[^>]*aria-describedby="[^"]+-description-hint [^"]+-description-error"/);
    expect(markup).toContain("Укажите название задания — не только пробелы.");
    expect(markup).toContain("Добавьте описание задания — не только пробелы.");
    expect(markup).toContain('role="alert"');
  });

  it("keeps a conflicting save error separate from valid field values and retained attachment", () => {
    const markup = render({ error: "Задание изменилось в другой вкладке.", retainedAttachmentName: "Условия.pdf" });
    expect(markup).toContain("Задание изменилось в другой вкладке.");
    expect(markup).toContain("Условия.pdf");
    expect(markup).toContain('value="Условная вероятность"');
    expect(markup).not.toContain('aria-invalid="true"');
  });

  it("marks the deadline error inline without changing or clearing its value", () => {
    const invalid = { ...form, deadline: "2026-10-19T09:00" };
    const markup = render({ form: invalid, error: "Срок сдачи не может быть раньше даты занятия." });
    expect(markup).toContain("Срок сдачи не может быть раньше даты занятия.");
    expect(markup).toMatch(/aria-describedby="[^"]+-deadline-error"/);
    expect(markup).toContain("19 октября");
  });
});
