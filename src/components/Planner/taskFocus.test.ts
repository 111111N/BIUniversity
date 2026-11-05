import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlannerTaskFocusRequest } from "./taskFocus";

const setup = () => {
  const doc = Object.assign(new EventTarget(), { defaultView: new EventTarget(), activeElement: null as Control | null, body: null as Control | null });
  const control = (id?: string) => ({
    dataset: { taskToggle: id }, disabled: false, isConnected: true, visible: true, hidden: false,
    closest: vi.fn<(selector: string) => object | null>(() => null),
    getClientRects() { return this.visible ? [1] : []; },
    focus: vi.fn(function (this: Control) { doc.activeElement = this; doc.dispatchEvent(new Event("focusin")); }),
    scrollIntoView: vi.fn(),
  });
  type Control = ReturnType<typeof control>;
  const body = control(); doc.body = body;
  const origin = control(); doc.activeElement = origin;
  const task = control("task"); const fallback = control("fallback");
  const details = { open: false };
  const day = { isConnected: true, dataset: { date: "2026-11-03" }, getClientRects: () => [1], closest: () => null,
    querySelector: () => details, querySelectorAll: () => [task, fallback] };
  const root = { ownerDocument: doc, isConnected: true, contains: vi.fn(() => false), querySelectorAll: vi.fn(() => [day]) };
  const request = (sourceWeek = "2026-11-02", targetWeek = sourceWeek, ids = ["task"], reveal = false) => createPlannerTaskFocusRequest(root as unknown as HTMLElement, sourceWeek, targetWeek, "2026-11-03", ids, reveal);
  return { doc, origin, body, task, fallback, details, root, day, request, control };
};

describe("planner action focus", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); });
  it("reveals completed tasks and focuses the requested task once", () => {
    const s = setup(); const request = s.request(undefined, undefined, ["task"], true);
    request.apply("2026-11-02"); request.apply("2026-11-02");
    expect(s.details.open).toBe(true); expect(s.task.focus).toHaveBeenCalledOnce();
    expect(s.task.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(s.task.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest", behavior: "auto" });
  });
  it("waits for the destination week without focusing the old week", () => {
    const s = setup(); const request = s.request("2026-10-26", "2026-11-02");
    request.apply("2026-10-26"); expect(s.task.focus).not.toHaveBeenCalled();
    request.apply("2026-11-02"); expect(s.task.focus).toHaveBeenCalledOnce();
  });
  it("allows the modal to restore focus within the same task before completing the move", () => {
    const s = setup(); const request = s.request(); const menu = s.control();
    menu.closest.mockReturnValue({ dataset: { plannerTask: "task" } }); s.root.contains.mockReturnValue(true);
    menu.focus(); request.apply("2026-11-02"); expect(s.task.focus).toHaveBeenCalledOnce();
  });
  it("keeps a user's new focus instead of taking it back", () => {
    const s = setup(); const request = s.request(); s.control().focus();
    request.apply("2026-11-02"); expect(s.task.focus).not.toHaveBeenCalled();
  });
  it.each(["pointerdown", "keydown"])("cancels a pending move after %s", (type) => {
    const s = setup(); const request = s.request(); s.doc.dispatchEvent(new Event(type)); request.apply("2026-11-02");
    expect(s.task.focus).not.toHaveBeenCalled();
  });
  it.each(["blur", "popstate"])("cancels when the page loses its context through %s", (type) => {
    const s = setup(); const request = s.request(); s.doc.defaultView.dispatchEvent(new Event(type)); request.apply("2026-11-02");
    expect(s.task.focus).not.toHaveBeenCalled();
  });
  it("expires instead of reviving on a later unrelated render", () => {
    const s = setup(); const request = s.request(); vi.advanceTimersByTime(1501); request.apply("2026-11-02");
    expect(s.task.focus).not.toHaveBeenCalled();
  });
  it("ignores detached roots and a third week", () => {
    const s = setup(); const request = s.request(); request.apply("2026-11-09"); request.apply("2026-11-02");
    expect(s.task.focus).not.toHaveBeenCalled();
    s.root.isConnected = false; s.request().apply("2026-11-02"); expect(s.task.focus).not.toHaveBeenCalled();
  });
  it("falls back to an enabled visible neighbour without using IDs as selectors", () => {
    const s = setup(); s.task.disabled = true;
    s.request(undefined, undefined, ['task"] [data-date="other']).apply("2026-11-02");
    expect(s.task.focus).not.toHaveBeenCalled(); expect(s.fallback.focus).toHaveBeenCalledOnce();
    expect(s.root.querySelectorAll).toHaveBeenCalledWith("[data-date]");
  });
  it("restores after the original control is removed but never into a detached task", () => {
    const s = setup(); const request = s.request(); s.origin.isConnected = false; s.doc.activeElement = s.body;
    s.task.isConnected = false; request.apply("2026-11-02"); expect(s.task.focus).not.toHaveBeenCalled(); expect(s.fallback.focus).toHaveBeenCalledOnce();
  });
});
