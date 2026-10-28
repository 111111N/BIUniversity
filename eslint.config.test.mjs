import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: fileURLToPath(new URL(".", import.meta.url)) });
const lint = async (source) => (await eslint.lintText(source, { filePath: "src/lint-policy-fixture.tsx" }))[0];
beforeAll(async () => { await eslint.calculateConfigForFile("src/lint-policy-fixture.tsx"); }, 20000);
describe("portal lint policy", () => {
  it("allows required error diagnostics but still reports arbitrary logging", async () => {
    const diagnostics = await lint('console.error("Ошибка чтения"); console.warn("Источник недоступен");');
    expect(diagnostics.errorCount).toBe(0); expect(diagnostics.warningCount).toBe(0);
    expect((await lint('console.log("debug");')).messages).toContainEqual(expect.objectContaining({ ruleId: "no-console", severity: 1 }));
  });
  it("allows keyboard scrolling in a named region without assigning an interactive role", async () => {
    const result = await lint('<div role="region" aria-label="История сообщений" tabIndex={0}><p>Сообщение</p></div>;');
    expect(result.errorCount).toBe(0);
  });
  it("keeps the focus restriction for ordinary noninteractive content", async () => {
    expect((await lint('<ul tabIndex={0}><li>Период</li></ul>;')).messages).toContainEqual(expect.objectContaining({ ruleId: "jsx-a11y/no-noninteractive-tabindex", severity: 2 }));
  });
  it("permits a labelled embedded PDF viewer while keeping button semantics checks", async () => {
    expect((await lint('<object tabIndex={0} data="blob:example" type="application/pdf" aria-label="Учебный материал">Скачайте оригинал</object>;')).errorCount).toBe(0);
    const button = await lint('<div onClick={() => {}}>Действие</div>;');
    expect(button.messages).toContainEqual(expect.objectContaining({ ruleId: "jsx-a11y/click-events-have-key-events", severity: 2 }));
    expect(button.messages).toContainEqual(expect.objectContaining({ ruleId: "jsx-a11y/no-static-element-interactions", severity: 2 }));
  });
  it("still checks a noninteractive element used for keyboard commands", async () => {
    expect((await lint('<ul onKeyDown={() => {}}><li>Период</li></ul>;')).messages).toContainEqual(expect.objectContaining({ ruleId: "jsx-a11y/no-noninteractive-element-interactions", severity: 2 }));
  });
});
