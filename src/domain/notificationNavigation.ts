import type { NotificationKind } from "../data/notificationStore";

export interface NotificationFilters { filter: "all" | "unread"; kind: "all" | NotificationKind; query: string }
const kinds: NotificationKind[] = ["assignment", "submission", "grade", "revision", "schedule"];
export const readNotificationFilters = (params: URLSearchParams): NotificationFilters => ({
  filter: params.get("read") === "unread" ? "unread" : "all",
  kind: kinds.find((kind) => kind === params.get("kind")) ?? "all",
  query: params.get("q") ?? "",
});

export const updateNotificationFilters = (params: URLSearchParams, patch: Partial<NotificationFilters>) => {
  const next = new URLSearchParams(params);
  const filters = { ...readNotificationFilters(params), ...patch };
  const values = { read: filters.filter === "all" ? "" : filters.filter, kind: filters.kind === "all" ? "" : filters.kind, q: filters.query };
  Object.entries(values).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
  return next;
};
