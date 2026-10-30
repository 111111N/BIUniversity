import type { JournalChange } from "../data/journalStore";
import { checkBackupAbort } from "./localBackup";
import { isValidHistoryCellChange } from "./journalHistoryValues";

type ChainRow = Readonly<Pick<JournalChange, "id" | "studentId" | "lessonId" | "field" | "previousValue" | "nextValue">>;
interface ChainFinding { id: string; level: "review"; code: "disconnected-journal-history"; message: string }
type StudentCells = { attendance: Map<string, ChainRow>; grade: Map<string, ChainRow> };

/** History is persisted newest first. Compare retained neighbours only, without rebuilding an initial journal. */
export const inspectJournalHistoryChain = async (rows: readonly ChainRow[], signal?: AbortSignal) => {
  const students = new Map<string, StudentCells>(); const issues: ChainFinding[] = [];
  let count = 0; let comparedPairs = 0;
  for (const row of rows) {
    if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkBackupAbort(signal);
    // Demo batches do not list changed cells; roster events may end a student's previous cell history.
    if (row.field === "demo") { students.clear(); continue; }
    if (row.field === "roster") { students.delete(row.studentId); continue; }
    let cells = students.get(row.studentId);
    if (row.lessonId === undefined) { cells?.[row.field].clear(); continue; }
    if (!isValidHistoryCellChange(row)) { cells?.[row.field].delete(row.lessonId); continue; }
    if (!cells) { cells = { attendance: new Map(), grade: new Map() }; students.set(row.studentId, cells); }
    const newer = cells[row.field].get(row.lessonId);
    if (newer) {
      comparedPairs++;
      if (newer.previousValue !== row.nextValue) issues.push({
        id: newer.id, level: "review", code: "disconnected-journal-history",
        message: "Предыдущее значение более нового события не совпадает с результатом предыдущего сохранённого изменения этой ячейки. Нужно проверить полноту и порядок истории; пропущенные события и значения не восстанавливались.",
      });
    }
    cells[row.field].set(row.lessonId, row);
  }
  checkBackupAbort(signal);
  return { issues, comparedPairs };
};
