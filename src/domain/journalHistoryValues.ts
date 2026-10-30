import type { JournalChange } from "../data/journalStore";

type HistoryValueRow = Pick<JournalChange, "field" | "lessonId" | "previousValue" | "nextValue">;
interface HistoryValueFinding { level: "error" | "review"; code: string; message: string }
const attendance = (value: unknown) => typeof value === "string" && ["unmarked", "present", "sick", "absent"].includes(value);
const grade = (value: unknown) => value === null || (typeof value === "number" && [2, 3, 4, 5].includes(value));
export const isValidHistoryCellChange = (row: HistoryValueRow) => row.field === "attendance" ? attendance(row.previousValue) && attendance(row.nextValue)
  : row.field === "grade" && grade(row.previousValue) && grade(row.nextValue);

/** Check the persisted event contract without resolving historical people, lessons or current journal cells. */
export const getJournalHistoryValueIssues = (row: HistoryValueRow): HistoryValueFinding[] => {
  const issues: HistoryValueFinding[] = [];
  const previous = row.previousValue; const next = row.nextValue;
  const cell = row.field === "attendance" || row.field === "grade";
  const valid = cell ? isValidHistoryCellChange(row)
    : row.field === "roster" ? (previous === null && next === "added") || (typeof previous === "string" && typeof next === "string")
    : previous === null && typeof next === "string";
  if (!valid) issues.push({ level: "error", code: "invalid-history-values", message: row.field === "attendance"
    ? "Значения события посещаемости не соответствуют поддерживаемым отметкам. Предыдущее и новое значения не исправлялись и не включены в отчёт."
    : row.field === "grade" ? "Значения события оценки должны быть целым числом от 2 до 5 или пустой оценкой. Предыдущее и новое значения не исправлялись и не включены в отчёт."
      : row.field === "roster" ? "Значения события состава не соответствуют добавлению, удалению или переименованию. Исходные значения не включены в отчёт и не изменены."
        : "У демонстрационного события ожидаются пустое предыдущее значение и строковое описание результата. Исходные значения не включены в отчёт и не изменены.",
  });
  if (cell && row.lessonId === undefined) issues.push({ level: "review", code: "missing-history-lesson", message: "В событии отметки или оценки не сохранён ID занятия. Соответствие историческому занятию требует отдельной проверки; дата события и текущие занятия не подставлялись." });
  if (!cell && row.lessonId !== undefined) issues.push({ level: "review", code: "unexpected-history-lesson", message: "У события состава или демонстрационного набора сохранён ID занятия. Причину этой связи нужно проверить; ссылка не удалялась и не использовалась для переноса отметок." });
  return issues;
};
