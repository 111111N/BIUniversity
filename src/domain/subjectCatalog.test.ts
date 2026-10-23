import { describe, expect, it } from "vitest";
import { createSubject, decodeSubjectCatalog, validateSubjectDraft, type SubjectCatalogDocument } from "./subjectCatalog";
import type { PortalAccount } from "./accounts";

const actor: PortalAccount = { id: "admin", name: "Настройщик", login: "configurator", role: "configurator", revision: 2, memberships: [] };
const state: SubjectCatalogDocument = { version: 1, revision: 4, subjects: [{ id: "old-subject", name: "Теория вероятностей", shortName: "ТВ", color: "red", semester: "" }], history: [] };
const command = { actorId: actor.id, actorRevision: 2, expectedRevision: 4, draft: { name: "  Иностранный   язык  ", shortName: " ИЯ " } };

describe("subject catalog commands", () => {
  it("creates a stable ID without mutating the original catalog and records its actor", () => {
    const next = createSubject(state, command, actor, "subject:stable-id", "change-id", "2026-10-23T10:00:00Z");
    expect(next).toMatchObject({ revision: 5, subjects: [state.subjects[0], { id: "subject:stable-id", name: "Иностранный язык", shortName: "ИЯ", semester: "", color: "red" }], history: [{ id: "change-id", subjectId: "subject:stable-id", actorId: "admin", action: "created" }] });
    expect(state.subjects).toHaveLength(1);
    expect(decodeSubjectCatalog(JSON.stringify(next))).toEqual(next);
  });
  it("rejects duplicate names and badge abbreviations after whitespace, Unicode and case normalization", () => {
    expect(() => validateSubjectDraft({ name: " теория  ВЕРОЯТНОСТЕЙ ", shortName: "Тест" }, state.subjects)).toThrow("названием");
    expect(() => validateSubjectDraft({ name: "Новый предмет", shortName: " тв " }, state.subjects)).toThrow("сокращение");
    expect(() => validateSubjectDraft({ name: "Other", shortName: "ＡＢ" }, [{ ...state.subjects[0], shortName: "ab" }])).toThrow("сокращение");
  });
  it("checks actor type, identity and both revisions", () => {
    const run = (nextActor = actor, overrides = {}) => () => createSubject(state, { ...command, ...overrides }, nextActor, "new", "change", "2026-10-23T10:00:00Z");
    expect(run({ ...actor, role: "teacher" })).toThrow("настройщику");
    expect(run({ ...actor, id: "other" })).toThrow("настройщику");
    expect(run(actor, { actorRevision: 1 })).toThrow("изменились");
    expect(run(actor, { expectedRevision: 3 })).toThrow("изменились");
  });
  it("rejects damaged definitions, duplicate IDs and broken history references", () => {
    expect(() => decodeSubjectCatalog(JSON.stringify({ ...state, subjects: [...state.subjects, { ...state.subjects[0], name: "Other", shortName: "Other" }] }))).toThrow();
    expect(() => decodeSubjectCatalog(JSON.stringify({ ...state, subjects: [{ ...state.subjects[0], name: " " }] }))).toThrow();
    expect(() => decodeSubjectCatalog(JSON.stringify({ ...state, history: [{ id: "history", actorId: "admin", action: "created", subjectId: "missing", occurredAt: "2026-10-23" }] }))).toThrow("история");
  });
});
