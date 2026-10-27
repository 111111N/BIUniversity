import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import PasswordResetDialog from "./PasswordResetDialog";
import type { PortalAccount } from "../../domain/accounts";

vi.mock("../../components/Modal", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
const account: PortalAccount = { id: "student", name: "Студент", login: "student", role: "student", revision: 1, memberships: [] };
const render = (target: PortalAccount) => renderToStaticMarkup(<PasswordResetDialog account={target} onClose={() => {}} onEditEmail={() => {}} />);
describe("password reset preview", () => {
  it("keeps sending disabled and explains the missing server, with a route to adding email", () => {
    const html = render(account);
    expect(html).toContain("Сервер авторизации не подключён"); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Отправить ссылку<\/button>/);
    expect(html).toContain("Добавить почту в данных учётки"); expect(html).not.toContain("Ссылка отправлена");
  });
  it("shows the saved recipient and allows correcting it without conflating password reset and restoring login", () => {
    const html = render({ ...account, email: "student@example.test", status: "blocked" });
    expect(html).toContain("student@example.test"); expect(html).toContain("Изменить почту в данных учётки");
    expect(html).toContain("Сброс пароля и восстановление доступа — отдельные действия");
  });
});
