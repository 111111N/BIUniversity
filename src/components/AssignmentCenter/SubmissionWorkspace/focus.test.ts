import { afterEach, describe, expect, it, vi } from "vitest";
import { focusSubmissionDetail, getSubmissionFocusIntent, type SubmissionFocusState } from "./focus";

const open: SubmissionFocusState = { currentId: "anna", answerOpen: true, unavailable: false, missingMode: false };

describe("submission focus transitions", () => {
  it("opens a linked answer and its unavailable state, but leaves an initial list alone", () => {
    expect(getSubmissionFocusIntent(null, open)).toBe("open");
    expect(getSubmissionFocusIntent(null, { ...open, unavailable: true })).toBe("open");
    expect(getSubmissionFocusIntent(null, { ...open, answerOpen: false })).toBeNull();
    expect(getSubmissionFocusIntent(null, { ...open, currentId: null })).toBeNull();
  });

  it("returns to the list even if opening the answer was cancelled before its animation frame", () => {
    expect(getSubmissionFocusIntent({ ...open, answerOpen: false }, open)).toBe("open");
    expect(getSubmissionFocusIntent(open, { ...open, answerOpen: false })).toBe("list");
  });

  it("handles removal and recovery without requiring a different URL or another student", () => {
    const removed = { ...open, unavailable: true };
    expect(getSubmissionFocusIntent(open, removed)).toBe("replacement");
    expect(getSubmissionFocusIntent(removed, open)).toBe("replacement");
  });

  it("replays an opening cancelled by StrictMode cleanup with the same navigation state", () => {
    expect(getSubmissionFocusIntent(null, open)).toBe("open");
    expect(getSubmissionFocusIntent(open, open)).toBe("open");
  });

  it("does not focus hidden answers in the missing-student mode", () => {
    const missing = { ...open, missingMode: true };
    expect(getSubmissionFocusIntent(null, missing)).toBeNull();
    expect(getSubmissionFocusIntent(open, missing)).toBeNull();
    expect(getSubmissionFocusIntent(missing, open)).toBe("revealed");
  });

  it("still focuses a deliberately selected different answer", () => {
    expect(getSubmissionFocusIntent(open, { ...open, currentId: "ivan" })).toBe("open");
  });

  it("does not focus a changed availability state while the answer pane is closed", () => {
    expect(getSubmissionFocusIntent({ ...open, answerOpen: false }, { ...open, answerOpen: false, unavailable: true })).toBeNull();
  });
});

const applyFocus = (intent: "open" | "replacement" | "revealed", mobile: boolean, active: "comment" | "search" | "body" = "body") => {
  const body = {};
  const comment = {};
  const search = {};
  vi.stubGlobal("document", { body, activeElement: active === "comment" ? comment : active === "search" ? search : body });
  const detail = { contains: (element: unknown) => element === comment, scrollIntoView: vi.fn() };
  const target = { focus: vi.fn() };
  focusSubmissionDetail(detail as unknown as HTMLElement, target as unknown as HTMLElement, intent, mobile);
  return { detail, target };
};

describe("submission detail focus and scrolling", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([true, false])("keeps the caret and scroll position when URL selection is recorded during editing (mobile: %s)", (mobile) => {
    const { detail, target } = applyFocus("open", mobile, "comment");
    expect(target.focus).not.toHaveBeenCalled();
    expect(detail.scrollIntoView).not.toHaveBeenCalled();
  });

  it.each([true, false])("focuses a deliberately opened answer, scrolling only on mobile (%s)", (mobile) => {
    const { detail, target } = applyFocus("open", mobile, "search");
    expect(target.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(detail.scrollIntoView).toHaveBeenCalledTimes(mobile ? 1 : 0);
    if (mobile) expect(detail.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("restores lost focus to the unavailable card instead of another student's answer", () => {
    const { detail, target } = applyFocus("replacement", true);
    expect(target.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(detail.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("does not steal focus from search when a background change replaces the answer", () => {
    const { detail, target } = applyFocus("replacement", true, "search");
    expect(target.focus).not.toHaveBeenCalled();
    expect(detail.scrollIntoView).not.toHaveBeenCalled();
  });

  it.each([true, false])("only moves from a disappearing mobile sidebar when leaving missing-student mode (%s)", (mobile) => {
    const { detail, target } = applyFocus("revealed", mobile, "search");
    expect(target.focus).toHaveBeenCalledTimes(mobile ? 1 : 0);
    expect(detail.scrollIntoView).toHaveBeenCalledTimes(mobile ? 1 : 0);
  });
});
