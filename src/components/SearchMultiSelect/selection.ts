import type { DropdownOption } from "../Dropdown";
import { matchesSearchOption } from "../../domain/search";

export const SELECTED_GROUPS_PER_PAGE = 6;
export const getGroupSelectionView = (options: DropdownOption[], value: string[], knownOptions: DropdownOption[], availableQuery: string, selectedQuery: string, requestedPage: number) => {
  const byId = new Map([...knownOptions, ...options].map((option) => [option.value, option]));
  const selectedIds = new Set(value);
  const selected = [...selectedIds].map((id) => byId.get(id) ?? { value: id, label: `Группа недоступна (${id})` });
  const availableIds = new Set(options.map((option) => option.value));
  const additions = options.filter((option) => !selectedIds.has(option.value) && matchesSearchOption(option, availableQuery));
  const filtered = selected.filter((option) => matchesSearchOption(option, selectedQuery));
  const pages = Math.max(1, Math.ceil(filtered.length / SELECTED_GROUPS_PER_PAGE));
  const page = Math.max(1, Math.min(Number.isSafeInteger(requestedPage) ? requestedPage : 1, pages));
  const start = (page - 1) * SELECTED_GROUPS_PER_PAGE;
  return { selected, additions, unavailable: selected.filter((option) => !availableIds.has(option.value)).length, filteredCount: filtered.length, page, pages, start, shown: filtered.slice(start, start + SELECTED_GROUPS_PER_PAGE) };
};

export const addGroupSelection = (value: string[], additions: DropdownOption[]) => [...new Set([...value, ...additions.map((option) => option.value)])];
