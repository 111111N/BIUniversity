import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleReviewListFocus } from "./reviewPaginationFocus";

type AnimationFrame = Parameters<typeof requestAnimationFrame>[0];
let frames: Map<number, AnimationFrame>;
let sequence: number;
let doc: EventTarget & { activeElement: unknown; body: object };
let button: { ownerDocument: typeof doc; disabled: boolean; isConnected: boolean };
let list: { isConnected: boolean; getClientRects: ReturnType<typeof vi.fn>; closest: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; scrollIntoView: ReturnType<typeof vi.fn> };
const schedule = (target: typeof list | null = list) => scheduleReviewListFocus(button as unknown as HTMLButtonElement, target as unknown as HTMLElement | null);
const flush = () => { const current = [...frames.values()]; frames.clear(); current.forEach((frame) => frame(0)); };
const moveFocus = (target: unknown) => { doc.activeElement = target; doc.dispatchEvent(new Event("focusin")); };

beforeEach(() => {
  frames = new Map(); sequence = 0;
  doc = Object.assign(new EventTarget(), { activeElement: null as unknown, body: {} });
  button = { ownerDocument: doc, disabled: false, isConnected: true };
  doc.activeElement = button;
  list = { isConnected: true, getClientRects: vi.fn(() => [{}]), closest: vi.fn(() => null), focus: vi.fn(), scrollIntoView: vi.fn() };
  vi.stubGlobal("requestAnimationFrame", (frame: AnimationFrame) => { frames.set(++sequence, frame); return sequence; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
});
afterEach(() => vi.unstubAllGlobals());

describe("archive review pagination focus", () => {
  it("focuses the new list after explicit pagination, keeping it visible", () => {
    schedule();
    expect(list.focus).not.toHaveBeenCalled();
    flush();
    expect(list.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(list.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "nearest", inline: "nearest" });
  });

  it("recovers focus when the last-page button becomes disabled and the browser focuses body", () => {
    schedule(); button.disabled = true; moveFocus(doc.body); flush();
    expect(list.focus).toHaveBeenCalledOnce();
  });

  it("does not steal focus from search even if the button regains focus before the frame", () => {
    schedule(); moveFocus({}); moveFocus(button); flush();
    expect(list.focus).not.toHaveBeenCalled();
  });

  it.each(["pointerdown", "keydown"])("cancels on subsequent %s, including a click outside controls", (type) => {
    schedule(); doc.dispatchEvent(new Event(type)); button.disabled = true; doc.activeElement = doc.body; flush();
    expect(list.focus).not.toHaveBeenCalled();
  });

  it("checks current focus even without a focusin event", () => {
    schedule(); doc.activeElement = {}; flush();
    expect(list.focus).not.toHaveBeenCalled();
  });

  it("does not interpret body focus as pagination when the button is still enabled", () => {
    schedule(); doc.activeElement = doc.body; flush();
    expect(list.focus).not.toHaveBeenCalled();
  });

  it.each(["button", "list"])("ignores a detached %s after leaving the result", (target) => {
    schedule(); (target === "button" ? button : list).isConnected = false; flush();
    expect(list.focus).not.toHaveBeenCalled();
  });

  it("does not focus a list hidden by a collapsed details element", () => {
    schedule(); list.getClientRects.mockReturnValue([]); flush();
    expect(list.focus).not.toHaveBeenCalled();
  });

  it("does not move behind an inert or aria-hidden modal background", () => {
    schedule(); list.closest.mockReturnValue({}); flush();
    expect(list.focus).not.toHaveBeenCalled();
  });

  it("cancels and releases listeners on filter changes, new results or unmount", () => {
    const remove = vi.spyOn(doc, "removeEventListener");
    const cancel = schedule(); cancel(); cancel(); flush();
    expect(frames.size).toBe(0);
    expect(list.focus).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it("releases listeners after successful focus", () => {
    const remove = vi.spyOn(doc, "removeEventListener");
    const cancel = schedule(); flush(); cancel();
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it.each(["unfocused", "missing-list"])("leaves pointer-only or missing-target pagination usable: %s", (state) => {
    if (state === "unfocused") doc.activeElement = doc.body;
    schedule(state === "missing-list" ? null : list)(); flush();
    expect(list.focus).not.toHaveBeenCalled();
    expect(sequence).toBe(0);
  });
});
