import type { PlannerNote } from "../../data/plannerStore";
import { getPlannerNoteDate } from "../../domain/planner";
import { toLocalDateKey } from "../../domain/schedule";
import { matchesSearchText } from "../../domain/search";

export const expandMatchingCompletedDays = (open: Record<string, boolean>, notes: PlannerNote[], query: string) => {
  if (!query.trim()) return open;
  const next = { ...open };
  for (const note of notes) {
    if (note.completed && matchesSearchText(`${note.title} ${note.text}`, query)) next[toLocalDateKey(getPlannerNoteDate(note))] = true;
  }
  return next;
};
