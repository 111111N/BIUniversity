import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createInitialAccountsDocument } from "../../data/accountStore";
import AccountDetailsRefreshPanel from "./AccountDetailsRefreshPanel";
import { accountDetailsDraftFrom, prepareAccountDetailsRefresh } from "./accountDetailsRefresh";

const state = createInitialAccountsDocument();
const account = state.accounts[1];
const draft = { ...accountDetailsDraftFrom(account), name: "Мой вариант" };
const editor = { account, draft, baseline: JSON.stringify(accountDetailsDraftFrom(account)), revision: 0, actorId: "configurator-demo", actorRevision: 1 };
const latest = { ...account, revision: 2, name: "Сохранённый вариант", role: "teacher" as const, status: "blocked" as const };
const review = prepareAccountDetailsRefresh(editor, { ...state, revision: 1, actorId: editor.actorId, accounts: state.accounts.map((entry) => entry.id === latest.id ? latest : entry) }).review!;
const render = (stale = false, disabled = false) => renderToStaticMarkup(<AccountDetailsRefreshPanel editor={editor} review={review} stale={stale} disabled={disabled} busy={false} onRefresh={() => {}} onChoose={() => {}} onCancel={() => {}} />);

describe("account detail comparison presentation", () => {
  it("shows both values, textual conflict and current role/access without implying a write", () => {
    const html = render();
    for (const text of ["Мой ввод", "Сейчас сохранено", "Мой вариант", "Сохранённый вариант", "Изменено с двух сторон", "Преподаватель", "Вход заблокирован", "запись выполняется отдельно"]) expect(html).toContain(text);
    expect(html).not.toContain('type="submit"');
  });
  it("disables choices after a new update while offering refresh and return to the draft", () => {
    const html = render(true);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Продолжить с моими правками/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Загрузить сохранённые данные/);
    expect(html).toContain("Обновить сравнение</button>");
    expect(html).toMatch(/<button type="button">К моему вводу/);
    expect(html).toContain('role="alert"');
  });
  it("allows return to the draft during a source failure without discarding it", () => {
    const html = render(true, true);
    expect(html).toMatch(/<button type="button">К моему вводу/);
    expect(html).toContain("Мой вариант");
  });
});
