import { describe, expect, it } from "vitest";
import type { PortalAccount } from "../../domain/accounts";
import { getAccountActionReview } from "./actionReview";

const student: PortalAccount = { id: "student", name: "Студент", login: "student", revision: 1, role: "student", studentGroupId: "g1", enrollmentStatus: "studying", memberships: [] };
const groups = [{ id: "g1", name: "112-МКо" }, { id: "g2", name: "113-МКо" }];
describe("account action review", () => {
  it.each([ ["graduated", "выпуск", "Выпущен"], ["withdrawn", "отчисление", "Отчислен"] ] as const)("describes %s without claiming a transfer or a change of login access", (state, label, result) => {
    const review = getAccountActionReview("education", student, { ...student, enrollmentStatus: state }, groups);
    expect(review.title).toBe(`Подтвердить ${label}?`);
    expect(review.changes).toEqual([{ label: "Состояние обучения", before: "Учится", after: result }]);
    expect(review.notes.join(" ")).not.toContain("с новой группой"); expect(review.notes.join(" ")).toContain("Доступ к кабинету не меняется");
  });
  it("shows the exact transfer and keeps input unchanged, rejecting a combined transfer and enrollment change", () => {
    const draft = { ...student, studentGroupId: "g2" };
    const before = structuredClone(draft);
    const review = getAccountActionReview("education", student, draft, groups);
    expect(review.changes).toEqual([{ label: "Учебная группа", before: "112-МКо", after: "113-МКо" }]);
    expect(review.validationMessage).toBe(""); expect(draft).toEqual(before);
    expect(getAccountActionReview("education", student, { ...draft, enrollmentStatus: "graduated" }, groups).validationMessage).toContain("отдельными событиями");
  });
  it("explains new administrative rights and removed teacher assignments before a role change", () => {
    const teacher: PortalAccount = { ...student, role: "teacher", memberships: [{ subjectId: "math", groupIds: ["g1"] }] };
    const review = getAccountActionReview("role", teacher, { ...teacher, role: "configurator", memberships: [] }, groups);
    expect(review.changes[0]).toEqual({ label: "Тип учётной записи", before: "Преподаватель", after: "Настройщик" });
    expect(review.notes.join(" ")).toContain("управление учётными записями"); expect(review.notes.join(" ")).toContain("назначения преподавателя будут сняты");
    expect(teacher.memberships).toHaveLength(1);
  });
  it("requires choosing the student group and shows the exact proposed number without reserving it", () => {
    const teacher = { ...student, role: "teacher" as const };
    const empty = getAccountActionReview("role", teacher, { ...teacher, role: "student", studentGroupId: undefined }, groups);
    expect(empty.validationMessage).toContain("Выберите учебную группу");
    const ready = getAccountActionReview("role", teacher, student, groups, "202630001");
    expect(ready.changes).toContainEqual({ label: "Номер зачетки", before: "Не выдан", after: "202630001" });
    expect(ready.validationMessage).toBe(""); expect(student.studentRecord).toBeUndefined();
    expect(getAccountActionReview("role", { ...teacher, status: "blocked" }, student, groups, "202630001").notes.join(" ")).toContain("Вход останется заблокирован");
  });
  it("distinguishes login restrictions from canceled lessons and other account settings", () => {
    const teacher = { ...student, role: "teacher" as const };
    const blocked = getAccountActionReview("block", teacher, teacher, groups);
    expect(blocked.notes.join(" ")).toContain("Опубликованные пары не отменяются автоматически");
    const restored = getAccountActionReview("activate", { ...student, status: "blocked" }, student, groups);
    expect(restored.changes).toEqual([{ label: "Доступ к кабинету", before: "Заблокирован", after: "Открыт" }]);
    expect(restored.notes.join(" ")).toContain("состояние обучения и назначения не изменятся");
  });
});
