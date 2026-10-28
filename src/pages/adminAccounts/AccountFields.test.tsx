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
  it("connects field errors to their inputs and keeps untouched fields out of the error state", () => {
    const html = renderToStaticMarkup(<AccountFields mode="details" draft={draft} account={student} groups={[]} disabled={false} errors={{ login: "Этот логин уже занят.", email: "Укажите корректную электронную почту." }} onChange={() => undefined} />);
    for (const field of ["login", "email"]) {
      const input = html.match(new RegExp(`<input[^>]*name="${field}"[^>]*>`))?.[0] ?? "";
      expect(input).toContain('aria-invalid="true"');
      const describedBy = /aria-describedby="([^"]+)"/.exec(input)?.[1];
      expect(describedBy).toBeTruthy();
      expect(html).toContain(`id="${describedBy}"`);
    }
    expect(html.match(/<input[^>]*name="name"[^>]*>/)?.[0]).not.toContain("aria-invalid");
    expect(html).toContain("Этот логин уже занят.");
    expect(html).toContain("Электронная почта (необязательно)");
  });
  it("labels required fields and links the login hint without errors on initial opening", () => {
    const html = render("details");
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).toContain("Имя и фамилия (обязательно)");
    expect(html).toContain("Логин (обязательно)");
    const login = html.match(/<input[^>]*name="login"[^>]*>/)?.[0] ?? "";
    const hintId = /aria-describedby="([^"]+)"/.exec(login)?.[1];
    expect(hintId).toBeTruthy(); expect(html).toContain(`id="${hintId}"`);
  });
  it("connects a missing student group problem to the searchable control", () => {
    const html = renderToStaticMarkup(<AccountFields mode="create" draft={{ ...draft, studentGroupId: undefined }} groups={[]} disabled={false} groupError="Выберите учебную группу студента." onChange={() => undefined} />);
    const input = html.match(/<input[^>]*aria-label="Учебная группа студента \(обязательно\)"[^>]*>/)?.[0] ?? "";
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain('role="combobox"');
    const hintId = /aria-describedby="([^"]+)"/.exec(input)?.[1];
    expect(hintId).toBeTruthy(); expect(html).toContain(`id="${hintId}"`);
  });
});
