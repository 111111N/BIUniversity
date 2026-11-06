import type { PlannerNote } from "../../data/plannerStore";

export const STATUS_FILTERS = [["all", "Все"], ["active", "В работе"], ["completed", "Готово"]] as const;
export const CATEGORY_FILTERS = [["all", "Все"], ["study", "Учебные"], ["personal", "Личные"]] as const;
export type StatusFilter = typeof STATUS_FILTERS[number][0];
export type CategoryFilter = typeof CATEGORY_FILTERS[number][0];

export const matchesFilters = (note: PlannerNote, status: StatusFilter, category: CategoryFilter) =>
  (status === "all" || (status === "active" ? !note.completed : note.completed)) && (category === "all" || note.category === category);
