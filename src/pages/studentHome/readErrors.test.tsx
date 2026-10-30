import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshAcademicCatalog, SUBJECT_CATALOG_STORAGE_KEY } from "../../data/academicCatalog";
import { journalKey } from "../../data/journalStore";
import { MANAGED_SCHEDULE_KEY } from "../../domain/scheduleManagement";
import StudentHome from ".";
import Home from "../home";

const session = vi.hoisted(() => ({ staff: false }));
vi.mock("../../components/RoleContext", () => ({ useRole: () => ({ currentUser: { id: session.staff ? "teacher-elena-volkova" : "anna-smirnova", role: session.staff ? "teacher" : "student", scheduleName: session.staff ? "Волкова Е.В." : undefined, name: "Тестовая учётная запись", memberships: [{ subjectId: "theory-of-probability", groupIds: ["112-mko"] }] } }) }));
vi.mock("../../data/plannerStore", () => ({ usePlannerNotes: () => ({ notes: [], error: "", setNotes: () => true }) }));

let values: Map<string, string>;
const render = (staff = false) => {
  session.staff = staff;
  return renderToStaticMarkup(<MemoryRouter>{staff ? <Home /> : <StudentHome />}</MemoryRouter>);
};
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 29, 12));
  values = new Map([["bi-university-demo-assignments", "[]"], ["bi-university-demo-submissions", "[]"]]);
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("home read failure presentation", () => {
  it.each([false, true])("does not claim everything is under control when assignments are unreadable (staff: %s)", (staff) => {
    values.set("bi-university-demo-assignments", "bad-json");
    const markup = render(staff);
    expect(markup).toContain("Не удалось прочитать задания и ответы.");
    expect(markup).toContain("Повторить загрузку");
    expect(markup).not.toContain("Всё под контролем");
    expect(markup).toContain("Поиск по аудитории");
    expect(markup).toContain("Расписание");
    expect(markup).toMatch(/<h2[^>]*tabindex="-1"[^>]*>Что требует внимания<\/h2>/);
    if (!staff) {
      expect(markup).toContain("Задания недоступны");
      expect(markup).not.toContain("Новых действий нет");
    }
  });

  it("distinguishes unreadable marks from the absence of grades", () => {
    values.set(journalKey("theory-of-probability", "112-mko"), "{}");
    const markup = render();
    expect(markup).toContain("Журнал недоступен");
    expect(markup).not.toContain("Оценок пока нет");
    expect(markup).not.toContain("Отметок пока нет");
    expect(markup).toContain("Актуальных заданий нет.");
    expect(markup).toMatch(/<h2[^>]*tabindex="-1"[^>]*>Учебный обзор<\/h2>/);
  });

  it("marks calendar lesson counts unavailable while keeping planner task counts", () => {
    values.set(MANAGED_SCHEDULE_KEY, "{}");
    const markup = render(true);
    expect(markup).toContain("Занятия: недоступны, задачи: 0");
    expect(markup).not.toContain("Нет пар");
    expect(markup).not.toContain("Всё под контролем");
  });

  it("does not show fallback timetable lessons when the academic catalog cannot be read", () => {
    values.set(SUBJECT_CATALOG_STORAGE_KEY, "{}");
    const markup = render();
    expect(markup).toContain("Расписание временно недоступно.");
    expect(markup).toContain("Повторить загрузку");
    expect(markup).not.toContain("data-lesson-id=");
    expect(markup).not.toContain("Следующий учебный день");
    expect(markup).not.toContain("Всё под контролем");
  });

  it("still shows the genuine empty assignment state after a successful read", () => {
    const markup = render();
    expect(markup).toContain("Всё под контролем");
    expect(markup).toContain("Актуальных заданий нет.");
    expect(markup).not.toContain("Повторить загрузку");
  });
});
