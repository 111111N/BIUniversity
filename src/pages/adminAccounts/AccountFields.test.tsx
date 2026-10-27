import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AccountDraft, PortalAccount } from "../../domain/accounts";
import AccountFields from "./AccountFields";
import type { AccountEditorMode } from "./presentation";

const draft: AccountDraft = { name: "Тестовый студент", login: "test.student", role: "student", memberships: [], studentGroupId: "g1" };
const student = { ...draft, id: "student", revision: 1 } as PortalAccount;
const render = (mode: AccountEditorMode, account: PortalAccount | undefined = mode === "create" ? undefined : student) => renderToStaticMarkup(<AccountFields mode={mode} draft={draft} account={account} groups={[{ value: "g1", label: "Первая группа" }]} disabled={false} onChange={() => undefined} />);
describe("account editing areas", () => {
  it("keeps personal details free of education and role changes", () => {
    const html = render("details");
    expect(html).toContain("Логин"); expect(html).toContain("Электронная почта");
    expect(html).not.toContain("Учебная группа студента"); expect(html).not.toContain("Состояние обучения"); expect(html).not.toContain("Тип учётной записи");
  });
  it("does not expose free-form group and state editing outside the education operation workflow", () => {
    const html = render("education");
    expect(html).not.toContain("Учебная группа студента"); expect(html).not.toContain("Состояние обучения");
    expect(html).not.toContain("Электронная почта"); expect(html).not.toContain("Тип учётной записи");
  });
  it("requests personal details and the student group during creation", () => {
    const html = render("create", undefined);
    expect(html).toContain("Имя и фамилия"); expect(html).toContain("Тип учётной записи"); expect(html).toContain("Учебная группа студента");
    expect(html).not.toContain("Состояние обучения");
  });
  it("does not offer an unrelated group transfer when the student role remains unchanged", () => {
    const html = render("role");
    expect(html).toContain("Тип учётной записи"); expect(html).not.toContain("Учебная группа студента");
  });
});
