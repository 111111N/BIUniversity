import { describe, expect, it, vi } from "vitest";
import { subscribeConflictPreviewChanges } from "./conflictPreviewSubscriptions";

describe("open conflict snapshot revalidation events", () => {
  it("reacts to cross-tab changes, local edits and returning to a visible window without reading data itself", () => {
    const environment = { window: new EventTarget(), document: new EventTarget() }, check = vi.fn(); const stop = subscribeConflictPreviewChanges(check, environment);
    environment.window.dispatchEvent(new Event("storage")); environment.window.dispatchEvent(new Event("bi-university-planner-change")); environment.window.dispatchEvent(new Event("focus")); environment.document.dispatchEvent(new Event("visibilitychange"));
    expect(check).toHaveBeenCalledTimes(4); stop();
    environment.window.dispatchEvent(new Event("storage")); environment.window.dispatchEvent(new Event("bi-university-planner-change")); environment.document.dispatchEvent(new Event("visibilitychange")); expect(check).toHaveBeenCalledTimes(4);
  });
});
