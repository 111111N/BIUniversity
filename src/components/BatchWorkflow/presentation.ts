export const getBatchApplyHint = ({ busy, blocked, stale, errors, changed }: { busy: boolean; blocked: boolean; stale: boolean; errors: number; changed: number }) => busy ? "Выполняем операцию. Дождитесь результата." : blocked ? "Сначала восстановите доступ к данным." : stale ? "Данные изменились. Обновите проверку перед применением." : errors ? `Исправьте строки с ошибками: ${errors}. Список пока не будет записан.` : !changed ? "Нет новых изменений для применения." : "Действие применяется ко всему проверенному списку, включая строки на других страницах.";

export const getBatchPage = (total: number, requestedPage: number, pageSize: number) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(requestedPage, pages));
  const start = (page - 1) * pageSize;
  return { page, pages, start, end: Math.min(start + pageSize, total) };
};
