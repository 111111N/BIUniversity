import { describe, expect, it } from "vitest";
import { getInterfaceErrorKind } from "./interfaceError";

describe("interface error recovery", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://example.test/assets/journal.js",
    "Importing a module script failed.",
    "error loading dynamically imported module: https://example.test/chunk.js",
    "Loading chunk 42 failed.",
    "Loading CSS chunk 42 failed.",
    "Unable to preload CSS for /assets/journal.css",
  ])("offers a full reload for a cached module failure: %s", (message) => {
    expect(getInterfaceErrorKind(new TypeError(message))).toBe("module");
  });
  it("recognizes named chunk errors and thrown messages", () => {
    const error = new Error("Request failed");
    error.name = "ChunkLoadError";
    expect(getInterfaceErrorKind(error)).toBe("module");
    expect(getInterfaceErrorKind("Unable to preload CSS for /journal.css")).toBe("module");
  });
  it("keeps a local retry for rendering and unrecognized failures", () => {
    for (const error of [new Error("Cannot read properties of undefined"), new TypeError("Failed to fetch"), null, undefined, { message: "Custom failure" }]) {
      expect(getInterfaceErrorKind(error)).toBe("render");
    }
  });
});
