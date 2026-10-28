import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import EducationOperations from "./EducationOperations";
import { prepareEducationOperation } from "./educationOperationModel";

const account = { id: "student", name: "Студент", login: "student", revision: 1, role: "student" as const, studentGroupId: "g1", enrollmentStatus: "studying" as const, memberships: [] };
const props: ComponentProps<typeof EducationOperations> = {
  account, draft: account, operation: null, education: { effectiveDate: "2026-10-27", basis: "" },
  groups: [{ id: "g1", name: "112-МКо" }, { id: "g2", name: "113-МКо" }],
  busy: false, disabled: false, stale: false, problem: "", onChoose: () => undefined, onGroup: () => undefined, onEducation: () => undefined, onCancel: () => undefined, onSubmit: () => undefined,
};
const render = (patch: Partial<typeof props> = {}) => renderToStaticMarkup(<MemoryRouter><EducationOperations {...props} {...patch} /></MemoryRouter>);

describe("education operation workspace", () => {
  it("keeps alternative actions in a collapsed disclosure with a document-retention explanation", () => {
    const html = render({ operation: "graduate", draft: prepareEducationOperation(account, account, "graduate") });
    expect(html).toMatch(/<details[^>]*><summary>Сменить действие/);
    expect(html).toContain("Дата, основание и документ останутся в форме");
    expect(html).toContain("Оформить отчисление</button>"); expect(html).toContain("Перевести в другую группу</button>");
  });
  it("keeps the archived selected transfer group visible for correction", () => {
    const html = render({ operation: "transfer", draft: { ...account, studentGroupId: "g2" }, groups: [{ id: "g1", name: "112-МКо" }, { id: "g2", name: "113-МКо", status: "archived" }], problem: "Выберите действующую учебную группу для перевода." });
    expect(html).toContain("113-МКо · В архиве"); expect(html).toContain("Выберите действующую учебную группу");
  });
  it("opens with current education and explicit actions, without an overwhelming editable form", () => {
    const html = render();
    expect(html).toContain("Текущая группа"); expect(html).toContain("112-МКо");
    expect(html).toContain("Перевести в другую группу"); expect(html).toContain("Оформить выпуск"); expect(html).toContain("Оформить отчисление");
    expect(html).not.toContain("<form"); expect(html).not.toContain("<textarea"); expect(html).not.toContain("role=\"combobox\"");
  });

  it("shows only the new group and event details for transfer, explaining why review is unavailable", () => {
    const html = render({ operation: "transfer", draft: prepareEducationOperation(account, account, "transfer"), problem: "Выберите другую учебную группу для перевода.", lastEventDate: "2026-10-01" });
    expect(html).toContain("Новая учебная группа"); expect(html).toContain("Основание"); expect(html).toContain("01.10.2026");
    expect(html).toContain("Выберите другую учебную группу для перевода.");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).not.toContain("Учебная группа студента"); expect(html).not.toContain("Выдать номер зачетки");
  });

  it.each(["graduate", "withdraw", "reinstate"] as const)("preserves the group and exposes no group selector during %s", (operation) => {
    const source = operation === "reinstate" ? { ...account, enrollmentStatus: "withdrawn" as const } : account;
    const html = render({ account: source, operation, draft: prepareEducationOperation(source, source, operation), education: { effectiveDate: "2026-10-27", basis: "Приказ ректора" } });
    expect(html).toContain("Группа сохраняется"); expect(html).toContain("Проверить изменения"); expect(html).toContain("Приказ ректора");
    expect(html).not.toContain("Новая учебная группа"); expect(html).not.toContain("role=\"combobox\"");
  });

  it("explains the recovery path for archived and missing groups", () => {
    const archived = render({ account: { ...account, enrollmentStatus: "withdrawn" }, groups: [{ id: "g1", name: "112-МКо", status: "archived" }] });
    expect(archived).toContain("Сначала восстановите группу"); expect(archived).toContain("Открыть архивную группу");
    expect(archived).toMatch(/<button[^>]*data-operation="reinstate"[^>]*disabled=""/);
    const missing = render({ groups: [] });
    expect(missing).toContain("Проверить учебные группы"); expect(missing).toContain("Группа недоступна");
  });
});
