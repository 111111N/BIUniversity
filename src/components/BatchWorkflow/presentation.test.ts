import { describe, expect, it } from "vitest";
import { getBatchPage } from "./presentation";

describe("batch list pagination", () => {
  it.each([
    { total: 0, requested: 8, expected: { page: 1, pages: 1, start: 0, end: 0 } },
    { total: 20, requested: 1, expected: { page: 1, pages: 1, start: 0, end: 20 } },
    { total: 21, requested: 2, expected: { page: 2, pages: 2, start: 20, end: 21 } },
    { total: 1000, requested: 50, expected: { page: 50, pages: 50, start: 980, end: 1000 } },
    { total: 3, requested: 50, expected: { page: 1, pages: 1, start: 0, end: 3 } },
    { total: 21, requested: 0, expected: { page: 1, pages: 2, start: 0, end: 20 } },
  ])("keeps a valid range for $total rows on requested page $requested", ({ total, requested, expected }) => {
    expect(getBatchPage(total, requested, 20)).toEqual(expected);
  });
});
