import { describe, expect, it } from "vitest";
import { createAcademicGroup, decodeGroupCatalog, emptyGroupCatalog, validateGroupDraft } from "./groupCatalog";
import { createInitialAccountsDocument } from "../data/accountStore";

const actor = createInitialAccountsDocument().accounts.find((account) => account.role === "configurator")!;
const draft = { name: "  101-ИВТ  ", course: 1, campus: 3, admissionYear: 2026 };
const command = { actorId: actor.id, actorRevision: actor.revision, expectedRevision: 0, draft };
const date = "2026-10-26T09:00:00.000Z";
const create = () => createAcademicGroup(emptyGroupCatalog(), command, actor, [], "group-new", "audit", date);
describe("group catalogue commands", () => {
  it("creates a stable empty group and its audit without mutating the source", () => {
    const before = emptyGroupCatalog();
    const next = createAcademicGroup(before, command, actor, [], "group-new", "audit", date);
    expect(next.groups[0]).toEqual({ ...draft, name: "101-ИВТ", id: "group-new", revision: 1, createdAt: date, createdBy: actor.id });
    expect(next.history[0]).toMatchObject({ groupId: "group-new", actorId: actor.id, action: "created" });
    expect(before.groups).toEqual([]);
    expect(decodeGroupCatalog(JSON.stringify(next))).toEqual(next);
  });
  it("rejects normalized duplicate names among managed and original groups", () => {
    expect(() => createAcademicGroup(create(), { ...command, expectedRevision: 1, draft: { ...draft, name: "１０１-ивт" } }, actor, [], "other", "other", date)).toThrow("уже существует");
    expect(() => createAcademicGroup(emptyGroupCatalog(), command, actor, [{ id: "seed", name: "101-ИВТ" }], "other", "other", date)).toThrow("уже существует");
  });
  it("rechecks author access and both revisions", () => {
    for (const invalid of [undefined, { ...actor, role: "student" as const }, { ...actor, status: "blocked" as const }, { ...actor, id: "different" }]) expect(() => createAcademicGroup(emptyGroupCatalog(), command, invalid, [], "new", "audit", date)).toThrow("настройщик");
    expect(() => createAcademicGroup(emptyGroupCatalog(), { ...command, expectedRevision: 2 }, actor, [], "new", "audit", date)).toThrow("изменились");
    expect(() => createAcademicGroup(emptyGroupCatalog(), command, { ...actor, revision: 2 }, [], "new", "audit", date)).toThrow("изменились");
  });
  it.each([{ campus: 0 }, { campus: 10 }, { course: 1.5 }, { admissionYear: 26 }, { name: " " }])("validates group fields: %o", (patch) => {
    expect(() => validateGroupDraft({ ...draft, ...patch })).toThrow();
  });
  it("refuses corrupt fields, duplicate IDs and malformed history", () => {
    const state = create();
    expect(() => decodeGroupCatalog("broken")).toThrow();
    expect(() => decodeGroupCatalog(JSON.stringify({ ...state, groups: [...state.groups, state.groups[0]] }))).toThrow();
    expect(() => decodeGroupCatalog(JSON.stringify({ ...state, groups: [{ ...state.groups[0], campus: 10 }] }))).toThrow();
    expect(() => decodeGroupCatalog(JSON.stringify({ ...state, history: [{ ...state.history[0], groupId: "missing" }] }))).toThrow();
  });
});
