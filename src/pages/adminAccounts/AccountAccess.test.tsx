import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AccountAccess from "./AccountAccess";
import type { PortalAccount } from "../../domain/accounts";

const account: PortalAccount = { id: "admin", name: "Настройщик", login: "admin", role: "configurator", revision: 1, memberships: [] };
const render = (target: PortalAccount, restriction = "", stale = false) => renderToStaticMarkup(<AccountAccess account={target} blockRestriction={restriction} stale={stale} busy={false} unavailable={false} onStatus={() => {}} onRole={() => {}} onReset={() => {}} />);
describe("account access controls", () => {
  it("shows the reason for a prohibited block and keeps the action disabled", () => {
    const html = render(account, "Нельзя заблокировать свою текущую учётную запись.");
    expect(html).toContain("Нельзя заблокировать свою текущую");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Заблокировать вход<\/button>/);
    expect(html).toContain("Сервер авторизации ещё не подключён"); expect(html).toContain("Посмотреть сброс пароля");
  });
  it("offers restoration for blocked accounts and disables writes against stale data", () => {
    expect(render({ ...account, status: "blocked" })).toMatch(/<button(?![^>]*disabled)[^>]*>Восстановить доступ<\/button>/);
    const html = render(account, "", true);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Заблокировать вход<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Изменить тип<\/button>/);
  });
});
