import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from ".";

vi.mock("../Modal", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
describe("unavailable confirmation", () => {
  it("allows returning to the form when applying a review is disabled", () => {
    const html = renderToStaticMarkup(<ConfirmDialog title="Проверка" confirmLabel="Применить" cancelLabel="Вернуться к форме" confirmDisabled error="Данные изменились" onConfirm={() => {}} onCancel={() => {}}><p>Введённые данные сохранены.</p></ConfirmDialog>);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Вернуться к форме<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Применить<\/button>/);
    expect(html).toContain('role="alert"'); expect(html).toContain("Данные изменились"); expect(html).toContain("Введённые данные сохранены");
  });
  it("places discard before continuing and keeps only the unavailable action disabled", () => {
    const html = renderToStaticMarkup(<ConfirmDialog intent="discard" title="Закрыть без сохранения?" confirmLabel="Не сохранять" cancelLabel="Продолжить редактирование" confirmDisabled onConfirm={() => {}} onCancel={() => {}}><p>Черновик открыт.</p></ConfirmDialog>);
    const buttons = Array.from(html.matchAll(/<button([^>]*)>(.*?)<\/button>/g));
    expect(buttons.map((button) => button[2])).toEqual(["Не сохранять", "Продолжить редактирование"]);
    expect(buttons[0][1]).toContain('disabled=""');
    expect(buttons[1][1]).not.toContain("disabled");
  });
  it("keeps the default cancel-first order for destructive confirmations", () => {
    const html = renderToStaticMarkup(<ConfirmDialog title="Удалить?" onConfirm={() => {}} onCancel={() => {}}><p>Удаление записи.</p></ConfirmDialog>);
    expect(Array.from(html.matchAll(/<button[^>]*>(.*?)<\/button>/g), (button) => button[1])).toEqual(["Отмена", "Удалить"]);
  });
});
