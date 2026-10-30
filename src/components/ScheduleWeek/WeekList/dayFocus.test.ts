import { afterEach, describe, expect, it, vi } from "vitest";
import { focusScheduleDay } from "./dayFocus";

const day = (key: string) => ({
  dataset: { scheduleDay: key }, isConnected: true,
  getClientRects: vi.fn<() => object[]>(() => [{}]), closest: vi.fn<() => object | null>(() => null),
  scrollIntoView: vi.fn(), focus: vi.fn(),
});
const root = (...days: ReturnType<typeof day>[]) => ({ isConnected: true, querySelectorAll: vi.fn(() => days) });
const jump = (list: ReturnType<typeof root> | null, key: string) => focusScheduleDay(list as unknown as HTMLElement | null, key);
afterEach(() => vi.restoreAllMocks());

describe("schedule day jump", () => {
  it("continues keyboard reading at the requested day instead of leaving focus in the top navigation", () => {
    const monday = day("2026-10-26"), saturday = day("2026-10-31"); const list = root(monday, saturday);
    expect(jump(list, "2026-10-31")).toBe(true);
    expect(saturday.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "start", behavior: "auto" });
    expect(saturday.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(saturday.scrollIntoView.mock.invocationCallOrder[0]).toBeLessThan(saturday.focus.mock.invocationCallOrder[0]);
    expect(monday.focus).not.toHaveBeenCalled(); expect(monday.scrollIntoView).not.toHaveBeenCalled();
  });

  it("looks only inside the current list, without constructing a selector from a date", () => {
    const requested = day('date"] [data-other="value'); const list = root(requested);
    expect(jump(list, requested.dataset.scheduleDay)).toBe(true);
    expect(list.querySelectorAll).toHaveBeenCalledWith("[data-schedule-day]");
    expect(requested.focus).toHaveBeenCalledOnce();
  });

  it("does not select another day after the requested week has changed", () => {
    const current = day("2026-11-02");
    expect(jump(root(current), "2026-10-26")).toBe(false);
    expect(current.scrollIntoView).not.toHaveBeenCalled(); expect(current.focus).not.toHaveBeenCalled();
  });

  it.each(["detached-root", "detached-day", "hidden-view", "inert-view"])("does not steal focus or scroll for %s", (state) => {
    const target = day("2026-10-26"), list = root(target);
    if (state === "detached-root") list.isConnected = false;
    if (state === "detached-day") target.isConnected = false;
    if (state === "hidden-view") target.getClientRects.mockReturnValue([]);
    if (state === "inert-view") target.closest.mockReturnValue({});
    expect(jump(list, "2026-10-26")).toBe(false);
    expect(target.scrollIntoView).not.toHaveBeenCalled(); expect(target.focus).not.toHaveBeenCalled();
  });

  it("handles an absent list without focusing the document or choosing a fallback day", () => {
    expect(jump(null, "2026-10-26")).toBe(false);
  });

  it("reports a failed jump without triggering a second scroll or focus", () => {
    const target = day("2026-10-26"); const error = new Error("Scroll unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    target.scrollIntoView.mockImplementation(() => { throw error; });
    expect(jump(root(target), "2026-10-26")).toBe(false);
    expect(log).toHaveBeenCalledWith("Не удалось перейти к выбранному дню расписания:", error);
    expect(target.focus).not.toHaveBeenCalled();
  });
});
