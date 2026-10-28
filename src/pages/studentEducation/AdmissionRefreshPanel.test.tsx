import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AdmissionRefreshPanel from "./AdmissionRefreshPanel";
import { makeAdmissionEditor, prepareAdmissionRefresh, type AdmissionRefreshSource } from "./admissionRefresh";

const source: AdmissionRefreshSource = { accounts: [{ id: "student", name: "Студент", login: "student", role: "student", revision: 1, memberships: [], studentGroupId: "g1" }, { id: "admin", name: "Настройщик", login: "admin", role: "configurator", revision: 1, memberships: [] }], actorId: "admin", revision: 0, groupRevision: 0, groups: [{ id: "g1", name: "112-МКо" }], educationEvents: [] };
const editor = makeAdmissionEditor("student", { effectiveDate: "2026-09-01", basis: "Приказ", documentNumber: "15-У", documentDate: "2026-08-30" }, source);
const review = prepareAdmissionRefresh(editor, source, "2026-10-28T10:00:00Z");
const noop = () => undefined;
const render = (patch = {}) => renderToStaticMarkup(<AdmissionRefreshPanel editor={editor} review={review} stale={false} disabled={false} busy={false} onContinue={noop} onRefresh={noop} onCancel={noop} {...patch} />);
describe("admission comparison presentation", () => {
  it("shows both states, the retained document and a return to the form without a save button", () => {
    const html = render(); expect(html).toContain("При подготовке"); expect(html).toContain("Сейчас"); expect(html).toContain("15-У");
    expect(html).toContain("История ещё не начата"); expect(html).toContain("Продолжить с актуальными данными"); expect(html).not.toContain("Сохранить зачисление");
  });
  it("explains a started history and prevents continuing while leaving the input accessible", () => {
    const html = render({ review: { ...review, firstEvent: { kind: "admitted", effectiveDate: "2026-10-27" }, restriction: "История обучения уже начата." } });
    expect(html).toContain("27.10.2026"); expect(html).toContain("документ остаётся в форме");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Продолжить с актуальными данными/);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>К моему вводу/);
  });
  it("offers a new comparison after another change and keeps continuation unavailable", () => {
    const html = render({ stale: true }); expect(html).toContain('role="alert"'); expect(html).toContain("Обновить сравнение</button>");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Продолжить с актуальными данными/);
  });
  it("lets invalid input be corrected after returning instead of blocking comparison acceptance", () => {
    const html = render({ review: { ...review, fieldProblem: "Исправьте дату документа." } });
    expect(html).toContain("После возврата к форме исправьте"); expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Продолжить с актуальными данными/);
  });
});
