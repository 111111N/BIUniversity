import { describe, expect, it } from "vitest";
import { getVendorChunk } from "./chunks";

describe("vendor chunk boundaries", () => {
  it.each([
    ["react", "vendor-react"], ["react-dom", "vendor-react"], ["scheduler", "vendor-react"],
    ["react-router", "vendor-router"], ["react-router-dom", "vendor-router"], ["react-select", "vendor-select"],
  ])("groups %s independently from application changes", (name, expected) => {
    expect(getVendorChunk(`/workspace/node_modules/${name}/dist/index.js`)).toBe(expected);
    expect(getVendorChunk(`C:\\workspace\\node_modules\\.pnpm\\${name}@1.0.0\\node_modules\\${name}\\index.js`)).toBe(expected);
  });
  it.each(["date-fns", "d3", "d3-scale", "react-is", "reactive-library", "@emotion/react"])("leaves %s to the actual dependency graph", (name) => {
    expect(getVendorChunk(`/workspace/node_modules/${name}/index.js`)).toBeUndefined();
  });
  it("uses the innermost installed package for nested and pnpm dependencies", () => {
    expect(getVendorChunk("/workspace/node_modules/react-select/node_modules/react/index.js")).toBe("vendor-react");
    expect(getVendorChunk("/workspace/node_modules/.pnpm/react@19.1.1/node_modules/other/index.js")).toBeUndefined();
  });
  it.each(["/workspace/src/react/index.ts", "/workspace/src/domain/accounts.ts", "\0commonjsHelpers.js", "virtual:react", "/workspace/node_modules-like/react/index.js"])("keeps application and virtual modules automatic: %s", (id) => {
    expect(getVendorChunk(id)).toBeUndefined();
  });
});
