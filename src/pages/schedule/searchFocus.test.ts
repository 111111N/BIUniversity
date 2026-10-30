import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusScheduleSearch } from "./searchFocus";

let doc: { activeElement: unknown };
let trigger: { ownerDocument: typeof doc; isConnected: boolean; disabled: boolean };
let input: { isConnected: boolean; disabled: boolean; getClientRects: ReturnType<typeof vi.fn>; closest: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> };
let panel: { isConnected: boolean; querySelector: ReturnType<typeof vi.fn> };
const open = () => focusScheduleSearch(trigger as unknown as HTMLButtonElement, panel as unknown as HTMLElement);

beforeEach(() => {
  doc = { activeElement: null };
  trigger = { ownerDocument: doc, isConnected: true, disabled: false };
  doc.activeElement = trigger;
  input = {
    isConnected: true, disabled: false,
    getClientRects: vi.fn(() => [{}]), closest: vi.fn(() => null),
    focus: vi.fn(() => { doc.activeElement = input; }),
  };
  panel = { isConnected: true, querySelector: vi.fn(() => input) };
});
afterEach(() => vi.restoreAllMocks());

describe("schedule search opening focus", () => {
  it("moves directly from the opening button to the visible query, allowing the browser to reveal it", () => {
    expect(open()).toBe(true);
    expect(doc.activeElement).toBe(input);
    expect(input.focus).toHaveBeenCalledExactlyOnceWith();
    expect(panel.querySelector).toHaveBeenCalledWith('input[type="search"]');
  });

  it("does not reclaim focus after the user has chosen another control before the opening commit", () => {
    const nextFocus = {};
    doc.activeElement = nextFocus;
    expect(open()).toBe(false);
    expect(doc.activeElement).toBe(nextFocus);
    expect(input.focus).not.toHaveBeenCalled();
  });

  it.each(["trigger", "panel", "input"] as const)("ignores a detached %s after closing or leaving the page", (target) => {
    ({ trigger, panel, input })[target].isConnected = false;
    expect(open()).toBe(false);
    expect(input.focus).not.toHaveBeenCalled();
  });

  it("does not focus a query without a visible layout box", () => {
    input.getClientRects.mockReturnValue([]);
    expect(open()).toBe(false);
    expect(input.focus).not.toHaveBeenCalled();
  });

  it.each(["[hidden]", "[inert]", '[aria-hidden="true"]'])("does not move focus into a %s ancestor", (attribute) => {
    input.closest.mockImplementation((selector: string) => selector.split(", ").includes(attribute) ? {} : null);
    expect(open()).toBe(false);
    expect(input.focus).not.toHaveBeenCalled();
  });

  it.each(["trigger", "input"] as const)("does not move focus when the %s is disabled", (target) => {
    ({ trigger, input })[target].disabled = true;
    expect(open()).toBe(false);
    expect(input.focus).not.toHaveBeenCalled();
  });

  it("handles missing controls without moving focus to another part of the document", () => {
    expect(focusScheduleSearch(null, panel as unknown as HTMLElement)).toBe(false);
    expect(focusScheduleSearch(trigger as unknown as HTMLButtonElement, null)).toBe(false);
    panel.querySelector.mockReturnValue(null);
    expect(open()).toBe(false);
    expect(input.focus).not.toHaveBeenCalled();
  });

  it("does not retry later if the browser rejects the focus request", () => {
    input.focus.mockImplementation(() => {});
    expect(open()).toBe(false);
    expect(input.focus).toHaveBeenCalledOnce();
    expect(doc.activeElement).toBe(trigger);
  });

  it("reports focus failures while leaving the search panel usable", () => {
    const error = new Error("Focus unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    input.focus.mockImplementation(() => { throw error; });
    expect(open()).toBe(false);
    expect(log).toHaveBeenCalledWith("Не удалось перейти к поиску расписания:", error);
    expect(doc.activeElement).toBe(trigger);
  });
});
