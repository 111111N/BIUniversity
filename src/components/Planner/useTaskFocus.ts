import { useLayoutEffect, useRef, type RefObject } from "react";
import { parseCalendarDate } from "../../domain/calendar";
import { getWeekStart, toLocalDateKey } from "../../domain/schedule";
import { createPlannerTaskFocusRequest } from "./taskFocus";

export const usePlannerTaskFocus = (root: RefObject<HTMLElement | null>, week: string) => {
  const pending = useRef<ReturnType<typeof createPlannerTaskFocusRequest> | null>(null);
  useLayoutEffect(() => { pending.current?.apply(week); });
  useLayoutEffect(() => () => { pending.current?.cancel(); }, []);
  return (dayKey: string, preferredIds: readonly string[] = [], revealCompleted = false) => {
    pending.current?.cancel();
    const date = parseCalendarDate(dayKey);
    if (!root.current || !date) return;
    pending.current = createPlannerTaskFocusRequest(root.current, week, toLocalDateKey(getWeekStart(date)), dayKey, preferredIds, revealCompleted);
  };
};
