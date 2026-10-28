import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export function inspectBuild(directory, base = "/") {
  if (!base.startsWith("/") || !base.endsWith("/") || base.startsWith("//")) throw new Error("Базовый путь должен начинаться и заканчиваться /.");
  const root = path.resolve(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".vite/manifest.json"), "utf8"));
  const checked = new Set();
  const asset = (file) => {
    const full = path.resolve(root, file);
    if (!full.startsWith(root + path.sep) || !fs.statSync(full).isFile()) throw new Error(`Недоступный файл сборки: ${file}`);
    checked.add(file);
    return full;
  };
  const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
  if (!entries.length) throw new Error("В manifest отсутствует точка входа.");
  for (const [key, item] of Object.entries(manifest)) {
    for (const file of [item.file, ...(item.css ?? []), ...(item.assets ?? [])]) asset(file);
    for (const dependency of [...(item.imports ?? []), ...(item.dynamicImports ?? [])]) {
      if (!manifest[dependency]) throw new Error(`Не найден модуль: ${key} → ${dependency}`);
    }
  }
  const visited = new Set();
  const visiting = new Set();
  const walk = (key, chain = []) => {
    if (visiting.has(key)) throw new Error(`Цикл статических JS-чанков: ${[...chain, key].join(" → ")}`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of manifest[key].imports ?? []) walk(dependency, [...chain, key]);
    visiting.delete(key);
    visited.add(key);
  };
  Object.keys(manifest).forEach((key) => walk(key));
  const closure = (key, found = new Set()) => {
    if (found.has(key)) return found;
    found.add(key);
    for (const dependency of manifest[key].imports ?? []) closure(dependency, found);
    return found;
  };
  for (const [key, item] of Object.entries(manifest)) {
    if (!item.name?.startsWith("vendor-")) continue;
    for (const dependency of closure(key)) {
      if (manifest[dependency].isEntry || manifest[dependency].isDynamicEntry) throw new Error(`Vendor зависит от приложения: ${key} → ${dependency}`);
    }
  }
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const htmlUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  for (const url of htmlUrls) {
    if (!url.startsWith(base)) throw new Error(`Неверный базовый путь: ${url}`);
    asset(url.slice(base.length));
  }
  for (const key of entries) {
    if (manifest[key].file.endsWith(".js") && !htmlUrls.includes(base + manifest[key].file)) throw new Error(`HTML не ссылается на точку входа: ${key}`);
  }
  const initial = new Set(entries.flatMap((key) => [...closure(key)]));
  const javascript = [...initial].map((key) => manifest[key]).filter((item) => item.file.endsWith(".js")).map((item) => {
    const content = fs.readFileSync(asset(item.file));
    return { name: item.name, file: item.file, bytes: content.length, gzipBytes: gzipSync(content).length };
  });
  return {
    base, manifestEntries: Object.keys(manifest).length, checkedAssets: checked.size,
    shellJavaScriptFiles: javascript.length,
    shellJavaScriptBytes: javascript.reduce((sum, item) => sum + item.bytes, 0),
    shellJavaScriptGzipBytes: javascript.reduce((sum, item) => sum + item.gzipBytes, 0),
    javascript, browserRuntimeChecked: false,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(inspectBuild(process.argv[2] ?? "dist", process.argv[3] ?? "/"), null, 2) + "\n"); }
  catch (error) { console.error("Проверка сборки не прошла:", error instanceof Error ? error.message : error); process.exitCode = 1; }
}
