import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryWithFocusRecovery } from "./retryFocus";

type AnimationFrame = Parameters<typeof requestAnimationFrame>[0];
let frames: AnimationFrame[];
let active: unknown;
let body: object;
let button: { isConnected: boolean };
let heading: { isConnected: boolean; focus: ReturnType<typeof vi.fn>; scrollIntoView: ReturnType<typeof vi.fn> };
const retry = (action: () => void, target: typeof heading | null = heading) => retryWithFocusRecovery(button as HTMLButtonElement, target as unknown as HTMLElement | null, action);
const recover = () => { button.isConnected = false; active = body; };
const flush = () => { for (const frame of frames.splice(0)) frame(0); };

beforeEach(() => {
  frames = []; body = {}; button = { isConnected: true }; active = button;
  heading = { isConnected: true, focus: vi.fn(), scrollIntoView: vi.fn() };
  vi.stubGlobal("document", { body, get activeElement() { return active; } });
  vi.stubGlobal("requestAnimationFrame", (frame: AnimationFrame) => { frames.push(frame); return frames.length; });
});
afterEach(() => vi.unstubAllGlobals());

describe("home retry focus recovery", () => {
  it("waits for the refreshed UI before returning lost keyboard focus to the same block", () => {
    const action = vi.fn(recover);
    retry(action);
    expect(action).toHaveBeenCalledOnce();
    expect(heading.focus).not.toHaveBeenCalled();
    flush();
    expect(heading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(heading.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "nearest", inline: "nearest" });
  });

  it("leaves focus on retry when the error and its button remain", () => {
    retry(() => {}); flush();
    expect(heading.focus).not.toHaveBeenCalled();
    expect(heading.scrollIntoView).not.toHaveBeenCalled();
  });

  it.each(["search", "calendar"])("does not take focus from %s if the user moves there before the frame", () => {
    retry(recover); active = {}; flush();
    expect(heading.focus).not.toHaveBeenCalled();
    expect(heading.scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not focus a detached heading after a quick page transition", () => {
    retry(recover); heading.isConnected = false; flush();
    expect(heading.focus).not.toHaveBeenCalled();
    expect(heading.scrollIntoView).not.toHaveBeenCalled();
  });

  it("still retries without moving focus if the button did not own it", () => {
    active = {};
    const action = vi.fn(recover);
    retry(action); flush();
    expect(action).toHaveBeenCalledOnce();
    expect(heading.focus).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
  });

  it("keeps retry usable when the optional recovery heading is absent", () => {
    const action = vi.fn(recover);
    retry(action, null); flush();
    expect(action).toHaveBeenCalledOnce();
    expect(heading.focus).not.toHaveBeenCalled();
  });
});
