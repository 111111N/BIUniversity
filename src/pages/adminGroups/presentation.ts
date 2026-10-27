import type { GroupChange } from "../../domain/groupCatalog";

export type GroupView = "current" | "dated" | "history";
export const getGroupView = (params: URLSearchParams): GroupView => params.get("view") === "history" ? "history" : params.has("asOf") ? "dated" : "current";

export const groupViewSearch = (current: URLSearchParams, view: GroupView, today: string) => {
  const next = new URLSearchParams(current);
  if (view === "history") next.set("view", "history");
  else {
    next.delete("view");
    if (view === "dated") { if (!next.has("asOf")) next.set("asOf", today); }
    else for (const key of ["asOf", "roster", "rosterQ", "rosterPage"]) next.delete(key);
  }
  return next;
};

export const GROUP_HISTORY_PAGE_SIZE = 20;
export const getGroupHistoryPage = (entries: GroupChange[], requested: string | null) => {
  const pages = Math.max(1, Math.ceil(entries.length / GROUP_HISTORY_PAGE_SIZE));
  const number = Number(requested ?? 1);
  const page = Math.min(Number.isSafeInteger(number) && number > 0 ? number : 1, pages);
  const start = (page - 1) * GROUP_HISTORY_PAGE_SIZE;
  return { page, pages, start, entries: entries.slice(start, start + GROUP_HISTORY_PAGE_SIZE) };
};

export const groupRegistrySearch = (current: URLSearchParams, groupId?: string) => {
  const next = new URLSearchParams(current);
  for (const key of ["group", "studentQ", "studentPage", "asOf", "roster", "rosterQ", "rosterPage", "view", "historyPage"]) next.delete(key);
  if (groupId) next.set("group", groupId);
  return next;
};
