import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import AssignmentTeacher from "./AssignmentTeacher";

const teacher = { id: "teacher", name: "Мария Иванова", login: "maria.ivanova", role: "teacher" as const, revision: 1, memberships: [] };
const props: ComponentProps<typeof AssignmentTeacher> = { teacher, teachers: [teacher], choosing: false, canChange: true, disabled: false, onChoose: () => undefined, onStart: () => undefined, onCancel: () => undefined };
const render = (patch: Partial<typeof props> = {}) => renderToStaticMarkup(<AssignmentTeacher {...props} {...patch} />);

describe("assignment teacher selection", () => {
  it("shows selected identity as a compact summary, with a separate change action", () => {
    const html = render();
    expect(html).toContain("Мария Иванова"); expect(html).toContain("maria.ivanova"); expect(html).toContain("Выбрать другого");
    expect(html).not.toContain("role=\"combobox\"");
  });
  it("opens search explicitly and lets the user return to the previous teacher", () => {
    const html = render({ choosing: true });
    expect(html).toContain("Преподаватель дисциплины"); expect(html).toContain("role=\"combobox\"");
    expect(html).toContain("Вернуться к выбранному преподавателю");
    expect(render({ teacher: undefined, choosing: true })).not.toContain("Вернуться к выбранному преподавателю");
  });
  it("keeps the teacher scope fixed and describes blocked access with text", () => {
    const html = render({ teacher: { ...teacher, status: "blocked" }, canChange: false });
    expect(html).toContain("Доступ заблокирован"); expect(html).not.toContain("Выбрать другого");
    expect(render({ disabled: true })).toMatch(/<button[^>]*disabled=""[^>]*>Выбрать другого<\/button>/);
  });
});
