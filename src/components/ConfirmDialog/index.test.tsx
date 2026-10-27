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
});
