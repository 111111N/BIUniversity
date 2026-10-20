import type { PlannerNote } from "../data/plannerStore";

export class PlannerDraftConflictError extends Error {}

const sameDate = (first?: Date, second?: Date) => first?.getTime() === second?.getTime();
const sameSchedule = (first: PlannerNote, second: PlannerNote) => sameDate(first.createdAt, second.createdAt)
  && sameDate(first.startAt, second.startAt) && sameDate(first.endAt, second.endAt);
const TEXT_FIELDS = ["title", "text", "priority", "category", "completed"] as const;
const FIELD_LABELS = { title: "название", text: "описание", priority: "приоритет", category: "категория", completed: "состояние выполнения" };

export const samePlannerNote = (first: PlannerNote, second: PlannerNote) => first.id === second.id
  && sameSchedule(first, second) && TEXT_FIELDS.every((field) => first[field] === second[field]);

/** A day and its optional start/end form one schedule; they must not be merged independently. */
export const mergePlannerDraft = (original: PlannerNote, draft: PlannerNote, latest: PlannerNote): PlannerNote => {
  if (!original.id || original.id !== draft.id || original.id !== latest.id) throw new PlannerDraftConflictError("Не удалось определить исходную задачу. Черновик оставлен в форме, данные не перезаписаны.");
  const merged = { ...latest };
  const conflict = (field: string): never => {
    throw new PlannerDraftConflictError(`Не удалось сохранить: поле «${field}» уже изменено в другом месте. Ваш текст оставлен в форме. Скопируйте нужные изменения и заново откройте задачу; сохранённая версия не перезаписана.`);
  };
  for (const field of TEXT_FIELDS) {
    if (draft[field] === original[field]) continue;
    if (latest[field] !== original[field] && latest[field] !== draft[field]) conflict(FIELD_LABELS[field]);
    // Each branch keeps the field's literal union type without widening the record.
    if (field === "title") merged.title = draft.title;
    else if (field === "text") merged.text = draft.text;
    else if (field === "priority") merged.priority = draft.priority;
    else if (field === "category") merged.category = draft.category;
    else merged.completed = draft.completed;
  }
  if (!sameSchedule(original, draft)) {
    if (!sameSchedule(original, latest) && !sameSchedule(draft, latest)) conflict("дата или время");
    merged.createdAt = draft.createdAt;
    merged.startAt = draft.startAt;
    merged.endAt = draft.endAt;
  }
  return merged;
};
