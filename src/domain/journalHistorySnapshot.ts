import type { JournalChange } from "../data/journalStore";
import type { Student } from "../components/Attendance/data/students";
import { checkBackupAbort } from "./localBackup";
import { isValidHistoryCellChange } from "./journalHistoryValues";

type HistoryRow = Readonly<Pick<JournalChange, "id" | "studentId" | "lessonId" | "field" | "previousValue" | "nextValue">>;
type CellRow = HistoryRow & { lessonId: string; field: "attendance" | "grade" };
type SnapshotStudent = Readonly<Pick<Student, "id" | "attendance" | "grades">>;
type Snapshot = { status: "readable"; students: readonly SnapshotStudent[] } | { status: "absent" | "invalid" };
interface SnapshotFinding { id?: string; level: "review"; code: string; message: string }
type FieldBoundary = { blocked: boolean; seen: Set<string> };
type StudentBoundary = { blocked: boolean; attendance: FieldBoundary; grade: FieldBoundary };

/** Compare only retained latest cell events with literal keys in the paired archived journal. */
export const inspectJournalHistorySnapshot = async (rows: readonly HistoryRow[], snapshot: Snapshot, signal?: AbortSignal) => {
  const boundaries = new Map<string, StudentBoundary>(); const candidates: CellRow[] = [];
  const issues: SnapshotFinding[] = []; let comparedCells = 0; let unresolvedCells = 0; let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  for (const row of rows) {
    await step();
    // Newer candidates remain usable; older cells cannot cross a batch or roster boundary.
    if (row.field === "demo") break;
    let boundary = boundaries.get(row.studentId);
    if (!boundary) {
      boundary = { blocked: false, attendance: { blocked: false, seen: new Set() }, grade: { blocked: false, seen: new Set() } };
      boundaries.set(row.studentId, boundary);
    }
    if (row.field === "roster") { boundary.blocked = true; continue; }
    const field = boundary[row.field];
    if (boundary.blocked || field.blocked) continue;
    if (row.lessonId === undefined) { field.blocked = true; continue; }
    if (field.seen.has(row.lessonId)) continue;
    field.seen.add(row.lessonId);
    // A bad latest transition must not be replaced by an older valid event.
    if (isValidHistoryCellChange(row)) candidates.push({ ...row, lessonId: row.lessonId, field: row.field });
  }
  checkBackupAbort(signal);
  if (!candidates.length) return { issues, comparedCells, unresolvedCells };
  if (snapshot.status !== "readable") {
    if (candidates.length) issues.push({ level: "review", code: "unavailable-journal-snapshot",
      message: snapshot.status === "absent"
        ? "В архиве нет журнала с тем же ключом учебной области. Последние применимые изменения не сверены; данные браузера не подставлялись."
        : "Журнал с тем же ключом учебной области не читается. Последние применимые изменения не сверены; читаемая часть и данные браузера не подставлялись.",
    });
    checkBackupAbort(signal);
    return { issues, comparedCells, unresolvedCells: candidates.length };
  }
  const students = new Map<string, SnapshotStudent>();
  for (const student of snapshot.students) { await step(); students.set(student.id, student); }
  for (const row of candidates) {
    await step();
    const student = students.get(row.studentId);
    const cells = row.field === "attendance" ? student?.attendance : student?.grades;
    if (!cells || !Object.hasOwn(cells, row.lessonId)) {
      unresolvedCells++;
      issues.push({ id: row.id, level: "review", code: "missing-journal-snapshot-cell",
        message: "В парном сохранённом журнале нет студента или точного ключа ячейки последнего применимого события. Сверка невозможна; пустая отметка, текущее занятие и состав группы не подставлялись.",
      });
      continue;
    }
    comparedCells++;
    if (cells[row.lessonId] !== row.nextValue) issues.push({ id: row.id, level: "review", code: "journal-history-snapshot-mismatch",
      message: "Результат последнего применимого события не совпадает с сохранённой ячейкой парного журнала из архива. Нужно проверить согласованность снимка и истории; значение для восстановления не выбиралось.",
    });
  }
  checkBackupAbort(signal);
  return { issues, comparedCells, unresolvedCells };
};
