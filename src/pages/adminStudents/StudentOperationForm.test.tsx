import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentOperationForm from "./StudentOperationForm";
import type { StudentOperationParameters } from "./operationParameters";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T10:00:00Z")); });
afterEach(() => vi.useRealTimers());
const parameters: StudentOperationParameters = { kind: "transfer", targetGroupId: "", education: { effectiveDate: "2026-10-28", basis: "" } };
const groups = [{ id: "g1", name: "112-МКо" }];
const noop = () => undefined;
const render = (patch = {}) => renderToStaticMarkup(<StudentOperationForm parameters={parameters} groups={groups} count={12} busy={false} unavailable={false} actorAvailable onGroup={noop} onEducation={noop} onPrepare={noop} onCancel={noop} {...patch} />);
describe("student operation parameter form", () => {
  it("starts quietly and lets an incomplete form be submitted for field validation", () => {
    const html = render(); expect(html).toContain('aria-label="Параметры массового действия" noValidate=""');
    expect(html).not.toContain('aria-invalid="true"'); expect(html).not.toContain("Проверьте отмеченные поля");
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*type="submit"[^>]*>Проверить список \(12\)/);
    expect(html).toContain("Применение изменений — отдельный шаг"); expect(html).not.toContain("Применить изменения</button>");
  });
  it("links group and education errors to their controls after a requested recheck", () => {
    const html = render({ validationRequest: 1 });
    expect((html.match(/aria-invalid="true"/g) ?? []).length).toBe(2);
    expect(html).toMatch(/aria-errormessage="[^"]+-error"/); expect(html).toMatch(/aria-describedby="[^"]+-basis-hint [^"]+-basis-error"/);
    expect(html).toContain("Для перевода выберите действующую группу"); expect(html).toContain("Список ещё не проверен");
  });
  it("preserves an archived selected group for explicit correction", () => {
    const html = render({ parameters: { ...parameters, targetGroupId: "g1" }, groups: [{ ...groups[0], status: "archived" }], validationRequest: 1 });
    expect(html).toContain("112-МКо · В архиве"); expect(html).toContain("Для перевода выберите действующую группу"); expect(html).toContain("Действующих групп нет");
  });
  it.each(["graduated", "withdrawn"] as const)("has no group selector for %s and preserves document values", (kind) => {
    const html = render({ parameters: { ...parameters, kind, education: { ...parameters.education, documentNumber: "Мой документ" } } });
    expect(html).not.toContain("Новая учебная группа"); expect(html).not.toContain('role="combobox"'); expect(html).toContain('value="Мой документ"');
  });
  it.each([
    { patch: { unavailable: true }, message: "Повторить чтение" },
    { patch: { actorAvailable: false }, message: "настройщика" },
    { patch: { count: 0 }, message: "выберите студентов" },
    { patch: { count: 1001 }, message: "больше 1000" },
  ])("keeps a blocked preview explained: $message", ({ patch, message }) => {
    const html = render(patch); expect(html).toContain(message); expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
  it("disables the document, calendars and cancellation during the preview request", () => {
    const html = render({ busy: true }); expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect((html.match(/<button[^>]*aria-haspopup="dialog"[^>]*disabled=""/g) ?? []).length).toBe(2);
    expect(html).toContain("Проверяем…"); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Отмена/);
  });
});
