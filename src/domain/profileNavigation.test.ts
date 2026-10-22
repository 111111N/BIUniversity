import { describe, expect, it } from "vitest";
import { getProfileOrigin } from "./profileNavigation";

describe("profile return navigation", () => {
  it("preserves the originating assignment and filters", () => {
    const to = "/journal/theory-of-probability/112-mko?tab=assignments&assignment=work-1#answers";
    expect(getProfileOrigin({ profileOrigin: { to, scrollY: 540 } }, "/journal").to).toBe(to);
    expect(getProfileOrigin({ profileOrigin: { to, scrollY: 540 } }, "/journal").scrollY).toBe(540);
  });
  it("rejects external, malformed and unknown return destinations", () => {
    for (const to of ["https://example.com", "//example.com", "/journal\\evil", "/journal\n/evil", "/settings", "/journals"]) {
      expect(getProfileOrigin({ profileOrigin: { to } }, "/cabinet").to).toBe("/cabinet");
    }
    expect(getProfileOrigin(null, "/cabinet").to).toBe("/cabinet");
  });
  it("handles missing and invalid scroll positions", () => {
    expect(getProfileOrigin({ profileOrigin: { to: "/messages?student=anna", scrollY: NaN } }, "/journal")).toEqual({ to: "/messages?student=anna", label: "Назад к сообщениям", scrollY: 0 });
  });
});
