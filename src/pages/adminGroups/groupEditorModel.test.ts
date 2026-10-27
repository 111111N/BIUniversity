import { describe, expect, it } from "vitest";
import type { PortalAccount } from "../../domain/accounts";
import { applyGroupRefresh, groupDraftFrom, isGroupEditorStale, prepareGroupRefresh, type GroupEditor, type GroupEditorSource } from "./groupEditorModel";

const actor: PortalAccount = { id: "admin", name: "Настройщик", login: "admin", role: "configurator", revision: 1, memberships: [] };
const saved = { id: "g1", name: "112-МКо", course: 2, campus: 3, admissionYear: 2025 };
const source: GroupEditorSource = { actorId: actor.id, accounts: [actor], revision: 2, groups: [saved], managed: [{ id: saved.id, revision: 1 }] };
const initialDraft = groupDraftFrom(saved, 2026);
const editor: GroupEditor = { draft: { ...initialDraft, name: "Мой вариант" }, baseline: JSON.stringify(initialDraft), groupId: saved.id, revision: 2, groupRevision: 1, actorId: actor.id, actorRevision: 1 };
const changed: GroupEditorSource = { ...source, revision: 3, groups: [{ ...saved, name: "Из другой вкладки", campus: 5 }], managed: [{ id: saved.id, revision: 2 }] };
const review = () => prepareGroupRefresh(editor, changed).review!;

describe("group editor refresh", () => {
  it("requires comparison when the target changed and retains the original draft and versions", () => {
    const before = structuredClone(editor);
    expect(isGroupEditorStale(editor, changed)).toBe(true);
    expect(prepareGroupRefresh(editor, changed)).toMatchObject({ editor: null, review: { groupId: saved.id, groupRevision: 2, latest: { name: "Из другой вкладки", campus: 5 } } });
    expect(editor).toEqual(before);
  });

  it("refreshes unrelated catalog changes without resetting typed fields or inventing a conflict", () => {
    const result = prepareGroupRefresh(editor, { ...source, revision: 3 });
    expect(result.review).toBeNull(); expect(result.editor?.draft).toEqual(editor.draft);
    expect(result.editor?.baseline).toBe(editor.baseline); expect(result.editor?.revision).toBe(3);
  });

  it("keeps the user's version only after an explicit choice and compares it to the actual new baseline", () => {
    const result = applyGroupRefresh(editor, review(), changed, "draft", 2026);
    expect(result.draft).toEqual(editor.draft); expect(result.draft).not.toBe(editor.draft);
    expect(JSON.parse(result.baseline)).toMatchObject({ name: "Из другой вкладки", campus: 5 });
    expect(JSON.stringify(result.draft)).not.toBe(result.baseline);
    expect(isGroupEditorStale(result, changed)).toBe(false); expect(editor.groupRevision).toBe(1);
  });

  it("loads saved fields as an unchanged form without modifying the former input", () => {
    const result = applyGroupRefresh(editor, review(), changed, "saved", 2026);
    expect(result.draft).toMatchObject({ name: "Из другой вкладки", campus: 5 });
    expect(JSON.stringify(result.draft)).toBe(result.baseline); expect(editor.draft.name).toBe("Мой вариант");
  });

  it("rejects a comparison that changed again, a missing target or a different actor with the same revision", () => {
    const replacement = { ...actor, id: "other-admin" };
    for (const next of [
      { ...changed, revision: 4 }, { ...changed, groups: [] },
      { ...changed, managed: [{ id: saved.id, revision: 3 }] },
      { ...changed, actorId: replacement.id, accounts: [actor, replacement] },
      { ...changed, accounts: [{ ...actor, status: "blocked" as const }] },
    ]) {
      expect(isGroupEditorStale(review(), next)).toBe(true);
      expect(() => applyGroupRefresh(editor, review(), next, "draft", 2026)).toThrow("Обновите сравнение");
    }
    expect(() => applyGroupRefresh({ ...editor, groupId: "other" }, review(), changed, "saved", 2026)).toThrow();
  });

  it("refuses unavailable groups and actors without silently granting current versions to the old draft", () => {
    expect(() => prepareGroupRefresh(editor, { ...source, groups: [] })).toThrow("реквизиты оставлены");
    expect(() => prepareGroupRefresh(editor, { ...source, accounts: [] })).toThrow("настройщика");
    expect(() => prepareGroupRefresh(editor, { ...source, accounts: [{ ...actor, role: "student" }] })).toThrow("настройщика");
    expect(editor.revision).toBe(2);
  });

  it("preserves the creation draft while refreshing its author and catalog checks", () => {
    const creation = { ...editor, groupId: undefined, groupRevision: 0 };
    const result = prepareGroupRefresh(creation, changed);
    expect(result.review).toBeNull(); expect(result.editor?.draft.name).toBe("Мой вариант");
    expect(result.editor?.revision).toBe(changed.revision);
    expect(groupDraftFrom({ name: "Исходная", course: 1 }, 2026)).toMatchObject({ campus: 0, admissionYear: 2026 });
  });
});
