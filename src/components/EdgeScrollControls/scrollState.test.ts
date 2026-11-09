import { describe, expect, it } from "vitest";
import { getBoardScrollDirections, getBoardScrollStep, getHoveredBoardEdge } from "./scrollState";

describe("shared edge scroll controls", () => {
  it("scrolls one column including its gap instead of a fraction of a wide viewport", () => {
    const board = { clientWidth: 1200, querySelectorAll: () => [{ getBoundingClientRect: () => ({ left: 100 }) }, { getBoundingClientRect: () => ({ left: 392 }) }] } as unknown as HTMLElement;
    expect(getBoardScrollStep(board)).toBe(292);
    expect(getBoardScrollStep(board, 205)).toBe(205);
  });
  it("offers only directions with remaining content and updates after resizing", () => {
    expect(getBoardScrollDirections(600, 2000, 0)).toEqual({ left: false, right: true });
    expect(getBoardScrollDirections(600, 2000, 700)).toEqual({ left: true, right: true });
    expect(getBoardScrollDirections(600, 2000, 1400)).toEqual({ left: true, right: false });
    expect(getBoardScrollDirections(2000, 2000, 0)).toEqual({ left: false, right: false });
    expect(getBoardScrollDirections(0, 2000, 0)).toEqual({ left: false, right: false });
  });
  it("ignores subpixel remnants and clamps elastic overscroll", () => {
    expect(getBoardScrollDirections(600, 2000, -20)).toEqual({ left: false, right: true });
    expect(getBoardScrollDirections(600, 2000, 1399.5)).toEqual({ left: true, right: false });
    expect(getBoardScrollDirections(600, 2000, 1450)).toEqual({ left: true, right: false });
    expect(getBoardScrollDirections(600, 601, 0)).toEqual({ left: false, right: false });
  });
  it("reveals the hovered edge without treating the middle or outside as an edge", () => {
    expect(getHoveredBoardEdge(310, 300, 1000, "mouse")).toBe("left");
    expect(getHoveredBoardEdge(1280, 300, 1000, "mouse")).toBe("right");
    expect(getHoveredBoardEdge(800, 300, 1000, "mouse")).toBeNull();
    expect(getHoveredBoardEdge(299, 300, 1000, "mouse")).toBeNull();
    expect(getHoveredBoardEdge(1301, 300, 1000, "mouse")).toBeNull();
  });
  it("adapts edge zones to narrow boards and ignores touch hover", () => {
    expect(getHoveredBoardEdge(30, 0, 300, "pen")).toBe("left");
    expect(getHoveredBoardEdge(270, 0, 300, "mouse")).toBe("right");
    expect(getHoveredBoardEdge(100, 0, 300, "mouse")).toBeNull();
    expect(getHoveredBoardEdge(10, 0, 300, "touch")).toBeNull();
    expect(getHoveredBoardEdge(0, 0, 0, "mouse")).toBeNull();
  });
});
