import type { ManagedLesson } from "../../domain/scheduleManagement";

interface WeekActionInput {
  dirty: boolean;
  editorOpen: boolean;
  hasDraft: boolean;
  published: boolean;
  conflicts: number;
  stale: boolean;
  busy: boolean;
  blockedReason: string;
}

// Presentation only: commands still enforce access, versions and publication rules.
export const getWeekActionState = (input: WeekActionInput) => {
  const action = input.hasDraft && !input.dirty ? "publish" : "save";
  const status = input.editorOpen ? "Правка пары" : input.dirty ? "Есть правки недели" : input.hasDraft ? "Черновик сохранён" : input.published ? "Опубликовано" : "Новая неделя";
  const reason = input.busy ? "Сохраняем черновик…" : input.blockedReason || (input.stale ? "Загрузите актуальную неделю перед сохранением." : input.editorOpen ? "Примените или отмените правки пары, затем сохраните неделю." : action === "publish" && input.conflicts ? "Исправьте конфликты в парах перед публикацией." : "");
  const hint = reason || (action === "publish" ? "Следующий шаг — проверить изменения. Публикация потребует подтверждения." : input.dirty ? "Сохраните правки в черновик. Опубликованная версия пока не изменится." : input.published ? "Чтобы изменить расписание, отредактируйте пары и сохраните черновик." : "Добавьте пары или сохраните пустую неделю в черновик.");
  return { action, status, hint, disabled: Boolean(reason), label: input.busy ? "Сохраняем…" : action === "publish" ? "Проверить и опубликовать" : "Сохранить черновик" } as const;
};

export const groupScheduleLessons = (lessons: ManagedLesson[]) => {
  const days = new Map<string, ManagedLesson[]>();
  for (const lesson of [...lessons].sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt))) {
    const day = days.get(lesson.date) ?? [];
    day.push(lesson);
    days.set(lesson.date, day);
  }
  return [...days].map(([date, entries]) => ({ date, lessons: entries }));
};
