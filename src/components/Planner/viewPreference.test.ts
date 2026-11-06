import { describe, expect, it } from "vitest";
import { getPlannerView } from "./viewPreference";

describe("planner view default", () => {
  it("uses the list on narrow screens until a view is chosen", () => {
    expect(getPlannerView(null, true)).toBe("list");
    expect(getPlannerView(null, false)).toBe("board");
  });
  it("respects either saved choice on any screen", () => {
    expect(getPlannerView("board", true)).toBe("board");
    expect(getPlannerView("list", false)).toBe("list");
    expect(getPlannerView("unknown", true)).toBe("list");
  });
});
