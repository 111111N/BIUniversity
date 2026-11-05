import type { PlannerNote } from "../../data/plannerStore";
import { getPlannerNoteDate } from "../../domain/planner";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";

export const PLANNER_DRAG_TYPE = "application/x-bi-planner-task";

export const createPlannerTaskDrag = (note: PlannerNote, scope: string, token: string) => {
  let active = true;
  const sourceDay = toLocalDateKey(getPlannerNoteDate(note));
  const accepts = (currentScope: string, day: string, types: readonly string[]) => active && currentScope === scope && day !== sourceDay && Boolean(parseCalendarDate(day)) && types.includes(PLANNER_DRAG_TYPE);
  return {
    note,
    accepts,
    cancel: () => { active = false; },
    drop(currentScope: string, day: string, data: Pick<DataTransfer, "types" | "getData">) {
      const accepted = accepts(currentScope, day, Array.from(data.types)) && data.getData(PLANNER_DRAG_TYPE) === token;
      active = false;
      return accepted ? parseCalendarDate(day) : null;
    },
  };
};
