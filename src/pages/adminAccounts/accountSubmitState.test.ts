import { describe, expect, it } from "vitest";
import { getAccountSubmitState, type AccountSubmitInput } from "./accountSubmitState";

const ready: AccountSubmitInput = { mode: "create", busy: false, unavailable: false, stale: false, restriction: "", needsNumber: true, hasNumber: true, campus: 3, numberLoading: false, numberError: "", missingGroup: false, changed: false };
describe("account action availability", () => {
  it("explains the missing group and campus rather than only disabling creation", () => {
    expect(getAccountSubmitState({ ...ready, hasNumber: false, campus: undefined, missingGroup: true })).toEqual({ disabled: true, hint: "Выберите учебную группу и корпус, чтобы получить номер зачетки." });
    expect(getAccountSubmitState({ ...ready, hasNumber: false, campus: undefined }).hint).toContain("Выберите учебный корпус");
  });
  it("separates pending, failed and absent number previews", () => {
    for (const patch of [{ numberLoading: true, text: "Получаем номер" }, { numberError: "Quota exceeded", text: "Повторите получение" }, { text: "Получите актуальный номер" }]) {
      const state = getAccountSubmitState({ ...ready, hasNumber: false, ...patch });
      expect(state.disabled).toBe(true); expect(state.hint).toContain(patch.text);
    }
  });
  it("gives unavailable and stale data priority over field instructions", () => {
    const unavailable = getAccountSubmitState({ ...ready, unavailable: true, stale: true, hasNumber: false });
    expect(unavailable.disabled).toBe(true); expect(unavailable.hint).toContain("Повторите чтение");
    expect(getAccountSubmitState({ ...ready, stale: true, hasNumber: false }).hint).toContain("Обновите карточку");
  });
  it("keeps role restrictions and unchanged forms disabled with their exact reason", () => {
    expect(getAccountSubmitState({ ...ready, restriction: "Последний активный настройщик" })).toEqual({ disabled: true, hint: "Последний активный настройщик" });
    expect(getAccountSubmitState({ ...ready, mode: "details", needsNumber: false }).hint).toBe("Нет изменений для сохранения.");
    expect(getAccountSubmitState({ ...ready, mode: "role", needsNumber: false }).hint).toContain("Выберите другой тип");
  });
  it("allows the form to focus a missing group after a number is ready", () => {
    const state = getAccountSubmitState({ ...ready, missingGroup: true });
    expect(state.disabled).toBe(false); expect(state.hint).toContain("Выберите учебную группу");
  });
  it("allows teachers and retained student numbers without requesting a new number", () => {
    for (const mode of ["create", "details", "role"] as const) expect(getAccountSubmitState({ ...ready, mode, needsNumber: false, hasNumber: false, changed: true }).disabled).toBe(false);
  });
  it("describes creation, role confirmation and details changes as separate operations", () => {
    expect(getAccountSubmitState(ready).hint).toContain("после создания");
    expect(getAccountSubmitState({ ...ready, mode: "role", changed: true }).hint).toContain("после подтверждения");
    expect(getAccountSubmitState({ ...ready, mode: "details", needsNumber: false, changed: true }).hint).toContain("только личные данные");
  });
  it("prevents repeated submission while saving", () => {
    const state = getAccountSubmitState({ ...ready, busy: true });
    expect(state.disabled).toBe(true); expect(state.hint).toContain("Дождитесь результата");
  });
});
