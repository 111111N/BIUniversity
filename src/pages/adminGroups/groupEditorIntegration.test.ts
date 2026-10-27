import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAccountsState } from "../../data/accountStore";
import { refreshAcademicCatalog } from "../../data/academicCatalog";
import { groupCatalogService, GROUP_CATALOG_STORAGE_KEY, readGroupCatalogState } from "../../data/groupCatalogStore";
import { applyGroupRefresh, groupDraftFrom, prepareGroupRefresh, type GroupEditor } from "./groupEditorModel";

let values: Map<string, string>;
let writes: number;
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const draft = { name: "101-ИВТ", course: 1, campus: 3, admissionYear: 2026 };
beforeEach(() => {
  values = new Map(); writes = 0;
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes++; values.set(key, value); } });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const source = () => ({ ...readGroupCatalogState(), accounts: readAccountsState().accounts, actorId: actor.actorId });
const createEditor = async (): Promise<GroupEditor> => {
  const group = await groupCatalogService.create({ ...actor, expectedRevision: 0, draft });
  const original = groupDraftFrom(group, 2026);
  return { ...actor, groupId: group.id, groupRevision: group.revision, revision: 1, draft: { ...original, name: "Мой вариант" }, baseline: JSON.stringify(original) };
};
const command = (editor: GroupEditor) => ({ ...actor, expectedRevision: editor.revision, groupId: editor.groupId!, groupRevision: editor.groupRevision, draft: editor.draft });

describe("group field refresh with the existing service", () => {
  it("requires a choice before reusing fresh versions, then saves explicitly with the normal history", async () => {
    const editor = await createEditor();
    await groupCatalogService.update({ ...command(editor), draft: { ...draft, name: "Сохранено другим сотрудником", campus: 5 } });
    const raw = values.get(GROUP_CATALOG_STORAGE_KEY);
    await expect(groupCatalogService.update(command(editor))).rejects.toThrow("изменились");
    expect(values.get(GROUP_CATALOG_STORAGE_KEY)).toBe(raw);
    const review = prepareGroupRefresh(editor, source()).review!;
    expect(review.latest.name).toBe("Сохранено другим сотрудником"); expect(writes).toBe(2);
    const next = applyGroupRefresh(editor, review, source(), "draft", 2026);
    expect(writes).toBe(2); expect(next.draft.name).toBe("Мой вариант");
    const updated = await groupCatalogService.update(command(next));
    expect(updated.id).toBe(editor.groupId); expect(updated.name).toBe("Мой вариант"); expect(writes).toBe(3);
    expect(readGroupCatalogState().history.at(-1)).toMatchObject({ before: { name: review.latest.name }, after: { name: "Мой вариант" } });
  });

  it("does not write when saved values are loaded, and rejects a comparison superseded by another update", async () => {
    const editor = await createEditor();
    await groupCatalogService.update({ ...command(editor), draft: { ...draft, campus: 5 } });
    const review = prepareGroupRefresh(editor, source()).review!;
    const loaded = applyGroupRefresh(editor, review, source(), "saved", 2026);
    expect(loaded.draft.campus).toBe(5); expect(JSON.stringify(loaded.draft)).toBe(loaded.baseline); expect(writes).toBe(2);
    await groupCatalogService.update({ ...command(loaded), draft: { ...loaded.draft, campus: 7 } });
    const before = values.get(GROUP_CATALOG_STORAGE_KEY);
    expect(() => applyGroupRefresh(editor, review, source(), "draft", 2026)).toThrow("Обновите сравнение");
    expect(values.get(GROUP_CATALOG_STORAGE_KEY)).toBe(before); expect(writes).toBe(3);
  });

  it("retains archived state when a user explicitly keeps their field values", async () => {
    const editor = await createEditor();
    const preview = await groupCatalogService.previewStatus(command(editor));
    await groupCatalogService.changeStatus({ ...preview, status: "archived" });
    const review = prepareGroupRefresh(editor, source()).review!;
    expect(review.latest.status).toBe("archived");
    const next = applyGroupRefresh(editor, review, source(), "draft", 2026);
    const updated = await groupCatalogService.update(command(next));
    expect(updated.status).toBe("archived"); expect(updated.name).toBe("Мой вариант");
  });
});
