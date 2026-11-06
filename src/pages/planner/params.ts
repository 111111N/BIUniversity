import { toLocalDateKey } from "../../domain/schedule";

export const withPlannerDate = (current: URLSearchParams, date: Date, clearTask = true) => {
  const next = new URLSearchParams(current);
  next.set("date", toLocalDateKey(date));
  if (clearTask) next.delete("task");
  return next;
};

export const withoutPlannerTask = (current: URLSearchParams) => {
  const next = new URLSearchParams(current);
  next.delete("task");
  return next;
};
