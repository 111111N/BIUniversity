import { describe, expect, it } from "vitest";
import { includeRegisteredJournalStudents } from "./journalAccounts";
import type { CurrentUser } from "./accounts";

const user = (id: string, role: CurrentUser["role"] = "student", groupId = "112-mko"): CurrentUser => ({ id, name: id, role, memberships: [{ subjectId: "data-analysis", groupIds: [groupId] }] });
describe("registered journal identities", () => {
  it("does not reinsert legacy students explicitly absent from a saved roster", () => {
    expect(includeRegisteredJournalStudents([], [user("legacy"), user("new")], "data-analysis", "112-mko", new Set(["legacy"]))).toEqual([{ id: "new", name: "new", attendance: {}, grades: {} }]);
  });
  it("includes only assigned students, with empty marks under their own ID", () => {
    expect(includeRegisteredJournalStudents([], [user("new"), user("other", "student", "113-mko"), user("teacher", "teacher"), user("admin", "configurator")], "data-analysis", "112-mko"))
      .toEqual([{ id: "new", name: "new", attendance: {}, grades: {} }]);
  });
  it("preserves existing grades and historical roster records across role changes", () => {
    const original = [{ id: "old", name: "Old", attendance: { lesson: "present" as const }, grades: { lesson: 4 as const } }];
    expect(includeRegisteredJournalStudents(original, [user("old", "teacher"), user("new")], "data-analysis", "112-mko")).toEqual([...original, { id: "new", name: "new", attendance: {}, grades: {} }]);
    expect(includeRegisteredJournalStudents(original, [user("old")], "data-analysis", "112-mko")).toBe(original);
  });
});
