import { describe, expect, it } from "vitest";
import { changesMaterialScope } from "./unsavedNavigation";

const transition = (from: string, to: string) => ({ currentLocation: new URL(from, "http://local"), nextLocation: new URL(to, "http://local") });

describe("pending material upload navigation", () => {
  it("protects changing the library, cabinet tab or page", () => {
    expect(changesMaterialScope(transition("/journal/math/a?tab=materials", "/journal/math/a?tab=materials&materials=subject"))).toBe(true);
    expect(changesMaterialScope(transition("/cabinet?tab=files", "/cabinet?tab=settings"))).toBe(true);
    expect(changesMaterialScope(transition("/cabinet?tab=files", "/journal"))).toBe(true);
  });
  it("does not interrupt notification controls within the current library", () => {
    expect(changesMaterialScope(transition("/cabinet?tab=files", "/cabinet?tab=files&notifications=open"))).toBe(false);
  });
});
