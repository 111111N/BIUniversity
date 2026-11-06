import type { AssessmentOutcome, AssessmentResult } from "../../domain/assessmentTypes";

export interface AssessmentResultConflict {
  studentId: string;
  local: AssessmentOutcome | null;
  saved: AssessmentOutcome | null;
}
const outcomeKey = (outcome: AssessmentOutcome | null) => outcome === null ? "empty" : outcome.status === "graded" ? `graded:${outcome.grade}` : outcome.status;
const cloneOutcome = (outcome: AssessmentOutcome | null): AssessmentOutcome | null => outcome === null ? null : { ...outcome };
const indexResults = (results: readonly AssessmentResult[]) => {
  const indexed = new Map<string, AssessmentOutcome | null>();
  for (const row of results) {
    if (!row.studentId || indexed.has(row.studentId)) throw new Error("Состав ведомости содержит повторяющиеся или неизвестные строки. Сохранение приостановлено.");
    indexed.set(row.studentId, row.outcome);
  }
  return indexed;
};

/** Rebase only unchanged rows automatically; competing edits to one mark require an explicit choice. */
export const reconcileAssessmentResults = (base: readonly AssessmentResult[], local: readonly AssessmentResult[], latest: readonly AssessmentResult[]): { results: AssessmentResult[]; conflicts: AssessmentResultConflict[] } => {
  const original = indexResults(base); const entered = indexResults(local); const saved = indexResults(latest);
  if (original.size !== entered.size || original.size !== saved.size || [...original.keys()].some((studentId) => !entered.has(studentId) || !saved.has(studentId))) {
    throw new Error("Состав ведомости изменился. Ввод сохранён; вернитесь к аттестации и проверьте состав перед новым редактированием.");
  }
  const conflicts: AssessmentResultConflict[] = [];
  const results = latest.map(({ studentId, outcome: remote }) => {
    const previous = original.get(studentId)!; const current = entered.get(studentId)!;
    if (outcomeKey(current) === outcomeKey(previous)) return { studentId, outcome: cloneOutcome(remote) };
    if (outcomeKey(remote) !== outcomeKey(previous) && outcomeKey(current) !== outcomeKey(remote)) {
      conflicts.push({ studentId, local: cloneOutcome(current), saved: cloneOutcome(remote) });
    }
    return { studentId, outcome: cloneOutcome(current) };
  });
  return { results, conflicts };
};
