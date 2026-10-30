import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Search from ".";

describe("home schedule search labels", () => {
  it.each([
    { mode: "auditorium", label: "Аудитория", query: "424/1", selected: "Поиск по аудитории" },
    { mode: "group", label: "Группа", query: "112-МКо", selected: "Поиск по группе" },
  ] as const)("keeps a visible label for $mode after typing", ({ mode, label, query, selected }) => {
    const markup = renderToStaticMarkup(<Search searchMode={mode} setSearchMode={() => {}} query={query} setQuery={() => {}} onSearch={() => {}} />);
    const inputId = markup.match(/<input[^>]*id="([^"]+)"/)?.[1];
    expect(inputId).toBeTruthy();
    expect(markup).toMatch(new RegExp(`<label[^>]*for="${inputId}"[^>]*>${label}</label>`));
    expect(markup).toContain(`value="${query}"`);
    expect(markup).toContain('placeholder=""');
    expect(markup).toContain('enterKeyHint="search"');
    expect(markup).toMatch(new RegExp(`aria-pressed="true"[^>]*>${selected}</button>`));
    expect(markup).toContain('aria-label="Найти расписание"');
    expect(markup).not.toContain("Введите название");
    expect(markup).not.toContain("Введите номер");
  });
});
