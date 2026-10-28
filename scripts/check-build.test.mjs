import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectBuild } from "./check-build.mjs";

let root;
const manifest = () => ({
  "index.html": { file: "assets/app.js", name: "app", isEntry: true, imports: ["vendor"], dynamicImports: ["page"], css: ["assets/app.css"] },
  vendor: { file: "assets/vendor-react.js", name: "vendor-react" },
  page: { file: "assets/page.js", name: "page", isDynamicEntry: true, imports: ["vendor"] },
});
const save = (value = manifest()) => fs.writeFileSync(path.join(root, ".vite/manifest.json"), JSON.stringify(value));
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "bi-build-check-"));
  fs.mkdirSync(path.join(root, ".vite")); fs.mkdirSync(path.join(root, "assets"));
  for (const file of ["app.js", "vendor-react.js", "page.js", "app.css"]) fs.writeFileSync(path.join(root, "assets", file), `/* ${file} */`);
  fs.writeFileSync(path.join(root, "index.html"), '<script type="module" src="/BIUniversity/assets/app.js"></script><link rel="stylesheet" href="/BIUniversity/assets/app.css">');
  save();
});
afterEach(() => {
  const target = path.resolve(root);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith("bi-build-check-")) throw new Error("Unexpected test cleanup path");
  fs.rmSync(target, { recursive: true, force: true });
});
describe("production artifact verification", () => {
  it("counts the full initial dependency closure and excludes a deferred page", () => {
    const result = inspectBuild(root, "/BIUniversity/");
    expect(result.shellJavaScriptFiles).toBe(2); expect(result.javascript.map((item) => item.name)).toEqual(["app", "vendor-react"]);
    expect(result.shellJavaScriptBytes).toBe(Buffer.byteLength("/* app.js *//* vendor-react.js */")); expect(result.checkedAssets).toBe(4);
    expect(result.shellJavaScriptGzipBytes).toBeGreaterThan(0); expect(result.browserRuntimeChecked).toBe(false);
  });
  it("rejects a missing deferred asset as well as a missing entry asset", () => {
    fs.unlinkSync(path.join(root, "assets/page.js")); expect(() => inspectBuild(root, "/BIUniversity/")).toThrow();
  });
  it("rejects an unresolved dynamic import", () => {
    const value = manifest(); value["index.html"].dynamicImports.push("missing"); save(value);
    expect(() => inspectBuild(root, "/BIUniversity/")).toThrow("Не найден модуль");
  });
  it("detects static chunk cycles introduced by manual grouping", () => {
    const value = manifest(); value.vendor.imports = ["index.html"]; save(value);
    expect(() => inspectBuild(root, "/BIUniversity/")).toThrow("Цикл статических");
  });
  it("rejects vendor depending on an application page without a static cycle", () => {
    const value = manifest(); value.vendor.imports = ["page"]; value.page.imports = []; save(value);
    expect(() => inspectBuild(root, "/BIUniversity/")).toThrow("Vendor зависит от приложения");
  });
  it("accepts the entry referring to a deferred page that imports the entry", () => {
    const value = manifest(); value.page.imports.push("index.html"); save(value);
    expect(inspectBuild(root, "/BIUniversity/").shellJavaScriptFiles).toBe(2);
  });
  it("rejects an HTML URL built for a different base", () => {
    expect(() => inspectBuild(root, "/other/")).toThrow("Неверный базовый путь");
  });
  it("rejects stale HTML even when its referenced old file is still present", () => {
    fs.writeFileSync(path.join(root, "index.html"), '<script type="module" src="/BIUniversity/assets/page.js"></script>');
    expect(() => inspectBuild(root, "/BIUniversity/")).toThrow("HTML не ссылается на точку входа");
  });
  it("does not read a manifest asset outside the build directory", () => {
    const value = manifest(); value.page.file = "../outside.js"; save(value);
    expect(() => inspectBuild(root, "/BIUniversity/")).toThrow("Недоступный файл");
  });
});
