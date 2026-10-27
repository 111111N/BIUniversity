import { describe, expect, it } from "vitest";
import type { PortalAccount } from "../../domain/accounts";
import { isAssignmentEditorStale, makeAssignmentEditor } from "./assignmentEditorModel";

const actor: PortalAccount = { id: "admin", name: "Настройщик", login: "admin", role: "configurator", revision: 1, memberships: [] };
const teacher: PortalAccount = { id: "teacher", name: "Преподаватель", login: "teacher", role: "teacher", revision: 2, memberships: [{ subjectId: "math", groupIds: ["g1", "g2"] }, { subjectId: "other", groupIds: ["g3"] }] };
const sources = { accounts: [actor, teacher], revision: 4, actorId: actor.id, catalogRevision: 5, groupRevision: 6 };

describe("assignment editor snapshot", () => {
  it("opens only the selected discipline's groups and allows editing without mutating stored assignments", () => {
    const editor = makeAssignmentEditor(sources, "math", teacher.id);
    expect(editor.groups).toEqual(["g1", "g2"]); expect(isAssignmentEditorStale(editor, sources)).toBe(false);
    editor.groups.pop();
    expect(teacher.memberships[0].groupIds).toEqual(["g1", "g2"]);
    expect(makeAssignmentEditor(sources, "new", teacher.id).groups).toEqual([]);
  });

  it.each(["revision", "catalogRevision", "groupRevision"] as const)("invalidates the review after %s changes while retaining current input", (key) => {
    const editor = makeAssignmentEditor(sources, "math", teacher.id);
    editor.groups = ["g2", "g4"];
    expect(isAssignmentEditorStale(editor, { ...sources, [key]: sources[key] + 1 })).toBe(true);
    expect(editor.groups).toEqual(["g2", "g4"]);
  });

  it("detects the actor changing even if the replacement has the same revision", () => {
    const editor = makeAssignmentEditor(sources, "math", teacher.id);
    const nextActor = { ...actor, id: "other-admin" };
    expect(isAssignmentEditorStale(editor, { ...sources, accounts: [...sources.accounts, nextActor], actorId: nextActor.id })).toBe(true);
  });

  it.each([
    { ...teacher, revision: 3 }, { ...teacher, role: "student" as const },
  ])("invalidates the selected teacher changing, regardless of the surrounding document revision", (latest) => {
    expect(isAssignmentEditorStale(makeAssignmentEditor(sources, "math", teacher.id), { ...sources, accounts: [actor, latest] })).toBe(true);
  });

  it("rejects missing teachers and an unavailable or blocked actor, while allowing the existing editing of blocked teachers", () => {
    expect(() => makeAssignmentEditor(sources, "math", "missing")).toThrow("Преподаватель недоступен");
    expect(() => makeAssignmentEditor({ ...sources, accounts: [teacher] }, "math", teacher.id)).toThrow("настройщика");
    const blockedActor = { ...actor, status: "blocked" as const };
    expect(() => makeAssignmentEditor({ ...sources, accounts: [blockedActor, teacher] }, "math", teacher.id)).toThrow("настройщика");
    const editor = makeAssignmentEditor(sources, "math", teacher.id);
    expect(isAssignmentEditorStale(editor, { ...sources, accounts: [blockedActor, teacher] })).toBe(true);
    expect(makeAssignmentEditor({ ...sources, accounts: [actor, { ...teacher, status: "blocked" }] }, "math", teacher.id).groups).toEqual(["g1", "g2"]);
  });

  it("reloads actual assignments into a new editor instead of rebasing the obsolete draft", () => {
    const previous = makeAssignmentEditor(sources, "math", teacher.id);
    previous.groups = ["unsaved"];
    const latestSources = { ...sources, revision: 5, accounts: [actor, { ...teacher, revision: 3, memberships: [{ subjectId: "math", groupIds: ["g4"] }] }] };
    const refreshed = makeAssignmentEditor(latestSources, "math", teacher.id);
    expect(refreshed.groups).toEqual(["g4"]); expect(isAssignmentEditorStale(refreshed, latestSources)).toBe(false);
    expect(previous.groups).toEqual(["unsaved"]); expect(previous.revision).toBe(4);
  });
});
