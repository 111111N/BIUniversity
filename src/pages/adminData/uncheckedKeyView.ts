import { matchesSearchText } from "../../domain/search";

export interface UncheckedKeyQuery { search: string; page: number }
export const emptyUncheckedKeyQuery = (): UncheckedKeyQuery => ({ search: "", page: 1 });
export const searchUncheckedKeys = (search: string): UncheckedKeyQuery => ({ search, page: 1 });
export const getUncheckedKeyPage = (keys: readonly string[], query: UncheckedKeyQuery) => {
  const matching = keys.filter((key) => matchesSearchText(key, query.search));
  const pages = Math.max(1, Math.ceil(matching.length / 10));
  const page = Math.min(Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1, pages);
  return { total: matching.length, pages, page, rows: matching.slice((page - 1) * 10, page * 10) };
};
