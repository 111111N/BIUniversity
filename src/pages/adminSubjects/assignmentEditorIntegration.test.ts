import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, readAccountsState } from "../../data/accountStore";
import { readSubjectCatalogState } from "../../data/subjectCatalogStore";
import { readGroupCatalogState } from "../../data/groupCatalogStore";
import { refreshAcademicCatalog } from "../../data/academicCatalog";
import { connectAdministrationPolicies } from "../../data/administrationIntegration";
import { publishManagedScheduleDraft, saveManagedScheduleDraft } from "../../data/managedScheduleStore";
import { replaceSubjectTeachingGroups } from "../../domain/accounts";
import { getManagedWeekKey } from "../../domain/scheduleManagement";
import { isAssignmentEditorStale, makeAssignmentEditor, type AssignmentEditor } from "./assignmentEditorModel";

let values: Map<string, string>;
let disconnect: () => void;
const actorId = "configurator-demo";
const teacherId = "teacher-elena-volkova";
const subjectId = "theory-of-probability";
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  refreshAcademicCatalog();
  disconnect = connectAdministrationPolicies();
});
afterEach(() => { disconnect(); values.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const sources = () => ({ ...readAccountsState(), actorId, catalogRevision: readSubjectCatalogState().revision, groupRevision: readGroupCatalogState().revision });
const open = () => makeAssignmentEditor(sources(), subjectId, teacherId);
const command = (editor: AssignmentEditor) => ({ actorId: editor.actorId, actorRevision: editor.actorRevision, expectedRevision: editor.revision, accountId: editor.account.id, accountRevision: editor.account.revision, memberships: replaceSubjectTeachingGroups(editor.account.memberships, editor.subjectId, editor.groups) });

describe("assignment editor with the existing service", () => {
  it("saves only the selected subject and leaves other teaching assignments intact", async () => {
    const editor = open();
    const otherAssignments = editor.account.memberships.filter((entry) => entry.subjectId !== subjectId);
    editor.groups = ["112-mko"];
    const updated = await accountService.updateAssignments(command(editor));
    expect(updated.memberships.filter((entry) => entry.subjectId !== subjectId)).toEqual(otherAssignments);
    expect(updated.memberships.find((entry) => entry.subjectId === subjectId)?.groupIds).toEqual(["112-mko"]);
    expect(readAccountsState().history.at(-1)?.action).toBe("assignments-changed");
  });

  it("keeps obsolete input for inspection and refuses a stale command; explicit reload reads actual groups", async () => {
    const editor = open(); editor.groups = ["112-mko"];
    await accountService.updateDetails({ actorId, actorRevision: 1, expectedRevision: 0, accountId: teacherId, accountRevision: 1, details: { name: editor.account.name, login: editor.account.login, email: "teacher@example.test" } });
    expect(isAssignmentEditorStale(editor, sources())).toBe(true);
    const before = values.get(ACCOUNTS_STORAGE_KEY);
    await expect(accountService.updateAssignments(command(editor))).rejects.toThrow("изменились");
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(before); expect(editor.groups).toEqual(["112-mko"]);
    const actual = open();
    expect(actual.groups).toEqual(["112-mko", "113-mko", "211-ivt"]);
    expect(isAssignmentEditorStale(actual, sources())).toBe(false);
  });

  it("keeps the publication guard authoritative when removing a group with a future published lesson", async () => {
    const weekStart = getManagedWeekKey("2099-10-19");
    const scope = { actorId, groupId: "112-mko", weekStart };
    const lesson = { id: "managed:assignment-review", scheduleId: 800011, subjectId, groupId: scope.groupId, teacherId, teacherName: "Елена Волкова", date: weekStart, startsAt: "07:00", endsAt: "08:00", room: "QA-ASSIGNMENT", type: "lecture" as const };
    await saveManagedScheduleDraft({ ...scope, expectedRevision: 0, lessons: [lesson] });
    await publishManagedScheduleDraft({ ...scope, expectedRevision: 1 });
    const editor = open(); editor.groups = editor.groups.filter((id) => id !== scope.groupId);
    expect(isAssignmentEditorStale(editor, sources())).toBe(false);
    const before = values.get(ACCOUNTS_STORAGE_KEY);
    await expect(accountService.updateAssignments(command(editor))).rejects.toThrow("опубликованные");
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(before); expect(editor.groups).not.toContain(scope.groupId);
  });
});
