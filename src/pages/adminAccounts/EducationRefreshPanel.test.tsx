import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createInitialAccountsDocument } from "../../data/accountStore";
import { readGroupCatalogState } from "../../data/groupCatalogStore";
import { accountDetailsDraftFrom } from "./accountDetailsRefresh";
import { prepareEducationOperation } from "./educationOperationModel";
import { prepareEducationRefresh, type EducationRefreshEditor } from "./educationRefresh";
import EducationRefreshPanel from "./EducationRefreshPanel";

const state = createInitialAccountsDocument(); const account = state.accounts[1]; const base = accountDetailsDraftFrom(account);
const editor: EducationRefreshEditor = { account, draft: prepareEducationOperation(account, base, "graduate"), baseline: JSON.stringify(base), educationOperation: "graduate", education: { effectiveDate: "2026-10-25", basis: "Мой приказ", documentNumber: "15-У" }, educationBaseline: { effectiveDate: "2026-10-28", basis: "" }, revision: 0, actorId: "configurator-demo", actorRevision: 1, educationGroupRevision: 0 };
const groups = readGroupCatalogState();
const review = prepareEducationRefresh(editor, { ...state, educationEvents: [], actorId: "configurator-demo", groups: groups.groups, groupRevision: 0 }, "2026-10-28T10:00:00Z");
const render = (stale = false, disabled = false) => renderToStaticMarkup(<EducationRefreshPanel editor={editor} review={{ ...review, problem: "Исправьте дату события." }} stale={stale} disabled={disabled} busy={false} onContinue={() => {}} onRefresh={() => {}} onCancel={() => {}} />);
describe("education refresh presentation", () => {
  it("shows old/current education, preserved document and a separate continuation without submitting an event", () => {
    const html = render();
    for (const text of ["При подготовке", "Сейчас", "Применится к актуальной группе", "Мой приказ", "15-У", "отдельной проверки и подтверждения", "Исправьте дату события."]) expect(html).toContain(text);
    expect(html).not.toContain('type="submit"');
  });
  it("blocks an outdated continuation and offers a safe return even during source failure", () => {
    const html = render(true, true);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Продолжить с актуальными данными/);
    expect(html).toContain('role="alert"'); expect(html).toMatch(/<button type="button">К моему вводу/);
    expect(html).toContain("Обновить сравнение");
  });
});
