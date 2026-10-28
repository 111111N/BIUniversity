import { describe, expect, it } from "vitest";
import { createInitialAccountsDocument } from "../../data/accountStore";
import { accountDetailsDraftFrom, applyAccountDetailsRefresh, getAccountDetailsComparison, isAccountDetailsReviewStale, prepareAccountDetailsRefresh, type AccountDetailsEditor, type AccountDetailsSource } from "./accountDetailsRefresh";

const initial = createInitialAccountsDocument();
const target = initial.accounts.find((entry) => entry.id === "anna-smirnova")!;
const source = (): AccountDetailsSource => ({ revision: 0, actorId: "configurator-demo", accounts: structuredClone(initial.accounts) });
const editor = (): AccountDetailsEditor => ({ account: structuredClone(target), draft: { ...accountDetailsDraftFrom(target), name: "Мой вариант" }, baseline: JSON.stringify(accountDetailsDraftFrom(target)), revision: 0, actorId: "configurator-demo", actorRevision: 1 });
const updatedSource = (): AccountDetailsSource => ({ ...source(), revision: 1, accounts: source().accounts.map((entry) => entry.id === target.id ? { ...entry, revision: 2, email: "other@example.test" } : entry) });

describe("explicit refresh of personal account data", () => {
  it("refreshes unrelated document changes without discarding edits or changing the original objects", () => {
    const input = editor(); const latest = { ...source(), revision: 1 };
    const original = structuredClone({ input, latest });
    const result = prepareAccountDetailsRefresh(input, latest);
    expect(result.review).toBeNull(); expect(result.editor).toMatchObject({ revision: 1, draft: { name: "Мой вариант" } });
    expect({ input, latest }).toEqual(original);
  });
  it("requires a choice for a changed target, preserving remote fields the user did not edit", () => {
    const input = editor(); const latest = updatedSource();
    const review = prepareAccountDetailsRefresh(input, latest).review!;
    const mine = applyAccountDetailsRefresh(input, review, latest, "mine");
    expect(mine.draft).toMatchObject({ name: "Мой вариант", email: "other@example.test" });
    expect(JSON.parse(mine.baseline)).toMatchObject({ name: target.name, email: "other@example.test" });
    expect(mine.account.revision).toBe(2); expect(mine.revision).toBe(1);
    const saved = applyAccountDetailsRefresh(input, review, latest, "saved");
    expect(JSON.stringify(saved.draft)).toBe(saved.baseline);
    expect(saved.draft.name).toBe(target.name);
    expect(input.draft.name).toBe("Мой вариант");
  });
  it("marks true conflicts separately from equal edits or changes on only one side", () => {
    const input = editor(); const latest = updatedSource();
    latest.accounts.find((entry) => entry.id === target.id)!.name = "Другой вариант";
    const review = prepareAccountDetailsRefresh(input, latest).review!;
    expect(getAccountDetailsComparison(input, review)).toMatchObject([{ field: "name", conflict: true }, { field: "login", changedHere: false, changedElsewhere: false }, { field: "email", changedHere: false, changedElsewhere: true }]);
    expect(applyAccountDetailsRefresh(input, review, latest, "mine").draft.name).toBe("Мой вариант");
    input.draft.name = "Другой вариант";
    expect(getAccountDetailsComparison(input, review)[0].conflict).toBe(false);
  });
  it("preserves explicit email clearing and login edits without restoring old education or access", () => {
    const input = editor(); input.account.email = "before@example.test"; input.draft.email = ""; input.draft.login = "my.login";
    const latest = updatedSource();
    const account = latest.accounts.find((entry) => entry.id === target.id)!;
    account.role = "teacher"; account.status = "blocked"; account.studentGroupId = undefined;
    account.memberships = [{ subjectId: "new-subject", groupIds: ["g2"] }]; account.scheduleName = "Актуальное имя расписания";
    account.studentRecord = { number: "202630001", year: 2026, campus: 3, sequence: 1, issuedAt: "2026-10-28T10:00:00Z" };
    const review = prepareAccountDetailsRefresh(input, latest).review!;
    const mine = applyAccountDetailsRefresh(input, review, latest, "mine");
    expect(mine.draft).toMatchObject({ email: "", login: "my.login", role: "teacher", memberships: account.memberships, scheduleName: account.scheduleName });
    expect(mine.account).toMatchObject({ status: "blocked", studentRecord: account.studentRecord });
    expect(mine.draft.studentGroupId).toBeUndefined();
  });
  it("takes a detached comparison snapshot including nested assignments", () => {
    const latest = updatedSource();
    const input = editor();
    const review = prepareAccountDetailsRefresh(input, latest).review!;
    const account = latest.accounts.find((entry) => entry.id === target.id)!;
    const group = review.latest.memberships[0].groupIds[0];
    account.email = "changed-again@example.test"; account.memberships[0].groupIds[0] = "other";
    expect(review.latest.email).toBe("other@example.test"); expect(review.latest.memberships[0].groupIds[0]).toBe(group);
  });
  it.each(["source-error", "different-actor", "blocked-actor", "student-actor", "missing-target"])("keeps the draft when refresh is unavailable: %s", (reason) => {
    const latest = source(); const input = editor();
    if (reason === "source-error") latest.error = "Источник недоступен";
    if (reason === "different-actor") latest.actorId = target.id;
    if (reason === "blocked-actor") latest.accounts.find((entry) => entry.id === latest.actorId)!.status = "blocked";
    if (reason === "student-actor") latest.accounts.find((entry) => entry.id === latest.actorId)!.role = "student";
    if (reason === "missing-target") latest.accounts = latest.accounts.filter((entry) => entry.id !== target.id);
    const original = structuredClone(input);
    expect(() => prepareAccountDetailsRefresh(input, latest)).toThrow(); expect(input).toEqual(original);
  });
  it.each(["document", "target", "actor", "blocked", "session", "source-error"])("rejects a comparison superseded by %s", (reason) => {
    const input = editor(); const latest = updatedSource();
    const review = prepareAccountDetailsRefresh(input, latest).review!;
    if (reason === "document") latest.revision++;
    if (reason === "target") latest.accounts.find((entry) => entry.id === target.id)!.revision++;
    if (reason === "actor") latest.accounts.find((entry) => entry.id === latest.actorId)!.revision++;
    if (reason === "blocked") latest.accounts.find((entry) => entry.id === latest.actorId)!.status = "blocked";
    if (reason === "session") latest.actorId = target.id;
    if (reason === "source-error") latest.error = "Ошибка чтения";
    expect(isAccountDetailsReviewStale(review, latest)).toBe(true);
    expect(() => applyAccountDetailsRefresh(input, review, latest, "mine")).toThrow();
    expect(input.draft.name).toBe("Мой вариант");
  });
  it("rejects a comparison for another editor or another baseline", () => {
    const input = editor(); const latest = updatedSource();
    const review = prepareAccountDetailsRefresh(input, latest).review!;
    expect(() => applyAccountDetailsRefresh({ ...input, revision: 10 }, review, latest, "mine")).toThrow("Обновите сравнение");
    expect(() => applyAccountDetailsRefresh({ ...input, account: { ...input.account, id: "other" } }, review, latest, "saved")).toThrow("Обновите сравнение");
  });
});
