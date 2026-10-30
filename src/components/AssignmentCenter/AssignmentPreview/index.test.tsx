import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssignmentForm } from "../../../domain/assignmentForm";
import AssignmentPreview from ".";

const modal = vi.hoisted(() => ({ onClose: undefined as (() => void) | undefined }));
vi.mock("../../Modal", () => ({
  default: ({ children, labelledBy, onClose }: { children: ReactNode; labelledBy: string; onClose(): void }) => {
    modal.onClose = onClose;
    return <div role="dialog" aria-labelledby={labelledBy}>{children}</div>;
  },
}));

const form: AssignmentForm = {
  subject: "Теория вероятностей", group: "112-МКо", lessonDate: "2026-10-20T09:00", lessonType: "Практика",
  title: "Условная вероятность", description: "Решите задачи и объясните ход решения.", deadline: "2026-10-23T23:59", status: "published", allowLateSubmissions: false,
};
const render = (props: Partial<ComponentProps<typeof AssignmentPreview>> = {}) => renderToStaticMarkup(<AssignmentPreview form={form} publishing saving={false} error="" onBack={() => {}} onSave={() => {}} {...props} />);

describe("assignment preview availability", () => {
  beforeEach(() => { modal.onClose = undefined; });

  it.each(["Ошибка чтения заданий.", "Задание больше недоступно."])("offers return to copy content when saving is blocked: %s", (unavailableReason) => {
    const markup = render({ unavailableReason, attachmentName: "Мои условия.pdf", attachmentSize: 512 });
    expect(markup).toContain(`Сохранение недоступно. ${unavailableReason}`);
    expect(markup).toContain('aria-busy="false"');
    expect(markup).not.toContain("Сохраняем");
    expect(markup).toContain("Условная вероятность");
    expect(markup).toContain("Решите задачи и объясните ход решения.");
    expect(markup).toContain("Мои условия.pdf");
    expect(markup).toMatch(/<button[^>]*>К тексту задания<\/button>/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>К тексту задания/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Сохранение недоступно/);
    const reasonId = markup.match(/<button[^>]*aria-describedby="([^"]+)"/)?.[1];
    expect(reasonId).toBeTruthy();
    expect(markup).toContain(`id="${reasonId}"`);
  });

  it("blocks return and saving only during a real save", () => {
    const markup = render({ saving: true });
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Сохраняем…");
    expect(markup.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });

  it.each([false, true])("guards modal dismissal by actual saving, not by a storage error (saving: %s)", (saving) => {
    const onBack = vi.fn();
    render({ saving, unavailableReason: "Ошибка чтения заданий.", onBack });
    expect(modal.onClose).toBeTypeOf("function");
    modal.onClose?.();
    expect(onBack).toHaveBeenCalledTimes(saving ? 0 : 1);
  });

  it.each([
    { status: "published", publishing: true, label: "Опубликовать задание" },
    { status: "published", publishing: false, label: "Сохранить изменения" },
    { status: "draft", publishing: false, label: "Сохранить черновик" },
    { status: "closed", publishing: false, label: "Завершить приём" },
    { status: "archived", publishing: false, label: "Отправить в архив" },
  ] as const)("keeps the existing save action for $status (publishing: $publishing)", ({ status, publishing, label }) => {
    const markup = render({ form: { ...form, status }, publishing });
    expect(markup).toContain(label);
    expect(markup).toContain("Вернуться к редактированию");
    expect(markup).not.toMatch(/<button[^>]*disabled=/);
  });

  it("keeps a failed-save explanation and content available for correction", () => {
    const markup = render({ error: "Задание изменилось в другой вкладке." });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Задание изменилось в другой вкладке.");
    expect(markup).toContain("Решите задачи и объясните ход решения.");
    expect(markup).not.toMatch(/<button[^>]*disabled=/);
  });
});
