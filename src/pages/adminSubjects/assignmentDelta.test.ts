import { describe, expect, it } from "vitest";
import { getAssignmentChanges } from "./assignmentDelta";

describe("assignment change preview", () => {
  it("compares identities rather than order and retains removals outside the active catalog", () => {
    const before = ["archived", "g1", "g2"];
    const after = ["g2", "g3", "g1"];
    expect(getAssignmentChanges(before, after)).toMatchObject({ added: ["g3"], removed: ["archived"] });
    expect(before).toEqual(["archived", "g1", "g2"]); expect(after).toEqual(["g2", "g3", "g1"]);
  });
  it("handles complete removal, unchanged groups and duplicate input", () => {
    expect(getAssignmentChanges(["g1", "g1"], []).removed).toEqual(["g1"]);
    expect(getAssignmentChanges(["g1", "g2"], ["g2", "g1"]).rows).toEqual([]);
    expect(getAssignmentChanges([], ["g1", "g1"]).added).toEqual(["g1"]);
  });
});
