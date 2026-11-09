import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannerNote } from "../../data/plannerStore";
import Planner from ".";

const snapshot = vi.hoisted(() => ({ notes: [] as PlannerNote[], error: "" }));
vi.mock("../../data/plannerStore", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../data/plannerStore")>(),
  usePlannerNotes: () => ({ ...snapshot, setNotes: vi.fn(), refreshNotes: vi.fn() }),
}));

const renderPlanner = () => renderToStaticMarkup(<Planner selectedWeekStart={new Date(2026, 10, 9)} selectedDate={new Date(2026, 10, 11)} />);

describe("planner cards and day navigation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 9, 12));
    snapshot.notes = [];
    snapshot.error = "";
  });
  afterEach(() => vi.useRealTimers());

  it("keeps search and both filters in the collapsed panel controlled by the toolbar button", () => {
    const html = renderPlanner();
    const toggle = html.match(/<button[^>]*aria-label="Поиск задач"[^>]*>/)?.[0];
    const panel = html.match(/<section[^>]*aria-label="Поиск и фильтры задач"[^>]*>[\s\S]*?<\/section>/)?.[0];
    const panelId = toggle?.match(/aria-controls="([^"]+)"/)?.[1];
    expect(panelId).toBeTruthy();
    expect(toggle).toContain('aria-expanded="false"');
    expect(panel).toContain(`id="${panelId}"`);
    expect(panel).toContain('hidden=""');
    expect(panel).toContain("Поиск по неделе");
    expect(panel).toContain('aria-label="Статус задачи"');
    expect(panel).toContain('aria-label="Категория задачи"');
    expect(html.indexOf('aria-label="Создать задачу"')).toBeGreaterThan(html.indexOf('aria-label="Дни недели планировщика"'));
    expect(html.indexOf('aria-label="Создать задачу"')).toBeLessThan(html.indexOf('role="region"'));
    expect(html).not.toContain("Найдено за неделю:");
    expect(html).not.toContain("Спланируйте свою неделю");
    expect(html).not.toContain("Первая задача");
    expect(html).not.toContain("Неделя прокручивается");
  });

  it("uses day jumps with valid targets and marks only today, independently of the selected date", () => {
    const html = renderPlanner();
    const navigation = html.match(/<nav[^>]*aria-label="Дни недели планировщика"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(navigation).not.toContain("aria-pressed");
    expect(navigation).not.toContain("Предыдущие дни");
    expect(navigation).not.toContain("Следующие дни");
    expect(navigation.match(/aria-current="date"/g)).toHaveLength(1);
    expect(navigation.match(/<button[^>]*aria-current="date"[^>]*>/)?.[0]).toContain("понедельник, 9 ноября");
    const targets = [...navigation.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
    expect(targets).toHaveLength(7);
    for (const target of targets) expect(html).toContain(`<article id="${target}"`);
    expect(html).not.toContain("Выбрано");
  });

  it("preserves weekly progress and both active and completed tasks in their days", () => {
    const date = new Date(2026, 10, 10, 10);
    const note: PlannerNote = { id: "active", title: "Подготовить доклад", text: "", createdAt: date, completed: false, category: "study", priority: "medium" };
    snapshot.notes = [note, { ...note, id: "done", title: "Сдать работу", completed: true }];
    const html = renderPlanner();
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain('aria-valuemax="2"');
    expect(html).toContain('data-planner-task="active"');
    expect(html).toContain('data-planner-task="done"');
    expect(html).toContain("Выполнено · 1");
  });
});
