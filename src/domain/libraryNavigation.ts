import type { JournalChange } from "../data/journalStore";

export interface FileFilters { query: string; category: string; sort: "date" | "name" | "size" }
export interface HistoryFilters { query: string; filter: "all" | JournalChange["field"]; limit: number }
const historyTypes = ["attendance", "grade", "roster", "demo"] as const;
export const readMaterialScope = (params: URLSearchParams) => params.get("materials") === "subject" ? "subject" : "group";

export const readFileFilters = (params: URLSearchParams): FileFilters => ({
  query: params.get("fileQ") ?? "",
  category: params.get("fileCategory") || "Все",
  sort: params.get("fileSort") === "name" ? "name" : params.get("fileSort") === "size" ? "size" : "date",
});

export const readHistoryFilters = (params: URLSearchParams): HistoryFilters => {
  const requestedLimit = Number(params.get("historyLimit"));
  return {
    query: params.get("historyQ") ?? "",
    filter: historyTypes.find((type) => type === params.get("historyType")) ?? "all",
    limit: Number.isInteger(requestedLimit) && requestedLimit >= 8 && requestedLimit <= 200 ? requestedLimit : 8,
  };
};

const updateParams = (params: URLSearchParams, values: Record<string, string>) => {
  const next = new URLSearchParams(params);
  Object.entries(values).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
  return next;
};

export const updateFileFilters = (params: URLSearchParams, patch: Partial<FileFilters>) => {
  const filters = { ...readFileFilters(params), ...patch };
  return updateParams(params, { fileQ: filters.query, fileCategory: filters.category === "Все" ? "" : filters.category, fileSort: filters.sort === "date" ? "" : filters.sort });
};

export const updateHistoryFilters = (params: URLSearchParams, patch: Partial<HistoryFilters>) => {
  const filters = { ...readHistoryFilters(params), ...patch };
  return updateParams(params, { historyQ: filters.query, historyType: filters.filter === "all" ? "" : filters.filter, historyLimit: filters.limit === 8 ? "" : String(filters.limit) });
};
