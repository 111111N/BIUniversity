import { describe, expect, it, vi } from "vitest";
import { searchOnEnter } from "./keyboard";

describe("home schedule search keyboard", () => {
  it("runs one search and prevents the default action for an ordinary Enter", () => {
    const preventDefault = vi.fn();
    const search = vi.fn();
    searchOnEnter({ key: "Enter", keyCode: 13, nativeEvent: { isComposing: false }, preventDefault }, search);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledOnce();
  });

  it.each([
    { key: "Enter", keyCode: 13, composing: true },
    { key: "Enter", keyCode: 229, composing: false },
    { key: "Process", keyCode: 229, composing: true },
    { key: "ArrowDown", keyCode: 40, composing: false },
  ])("does not interrupt input or search for $key/$keyCode (composition: $composing)", ({ key, keyCode, composing }) => {
    const preventDefault = vi.fn();
    const search = vi.fn();
    searchOnEnter({ key, keyCode, nativeEvent: { isComposing: composing }, preventDefault }, search);
    expect(search).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
