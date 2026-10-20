export const PERFORMANCE_GRADES = [5, 4, 3, 2] as const;
export type PerformanceGrade = typeof PERFORMANCE_GRADES[number];
export const isPerformanceGrade = (value: unknown): value is PerformanceGrade =>
  typeof value === "number" && PERFORMANCE_GRADES.some((grade) => grade === value);

/** Округляет доли так, чтобы сумма отображаемых процентов была ровно 100. */
export const normalizeGradeShares = (counts: number[]): number[] => {
  const values = counts.map((count) => Number.isFinite(count) ? Math.max(0, count) : 0);
  const total = values.reduce((sum, count) => sum + count, 0);
  if (total === 0) return values.map(() => 0);

  const exact = values.map((count) => count / total * 100);
  const rounded = exact.map(Math.floor);
  const remainder = 100 - rounded.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - rounded[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let index = 0; index < remainder; index += 1) rounded[order[index].index] += 1;
  return rounded;
};
