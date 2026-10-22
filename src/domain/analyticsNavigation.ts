import { toLocalDateKey } from "./schedule";
import type { AnalyticsPeriod } from "./teacherAnalytics";

const dateKey = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) && toLocalDateKey(date) === value ? value : null;
};

export const readAnalyticsNavigation = (params: URLSearchParams, memberships: Array<{ subjectId: string; groupIds: string[] }>, now: Date) => {
  const subjectId = memberships.some((item) => item.subjectId === params.get("subject")) ? params.get("subject")! : "all";
  const allowedGroups = memberships.filter((item) => subjectId === "all" || item.subjectId === subjectId).flatMap((item) => item.groupIds);
  const groupId = allowedGroups.includes(params.get("group") ?? "") ? params.get("group")! : "all";
  const period = (["semester", "month", "four-weeks", "week"] as AnalyticsPeriod[]).find((item) => item === params.get("period")) ?? "semester";
  const gradeIndex = [5, 4, 3, 2].indexOf(Number(params.get("grade")));
  const drill = dateKey(params.get("drill"));
  return {
    subjectId, groupId, period,
    selectedWeek: new Date(`${dateKey(params.get("week")) ?? toLocalDateKey(now)}T00:00:00`),
    selectedGrade: gradeIndex === -1 ? null : gradeIndex,
    drillWeek: drill && new Date(`${drill}T00:00:00`).getDay() === 1 ? drill : null,
    showAllRisks: params.get("risks") === "all",
    attendanceSort: params.get("attendanceSort") === "asc" ? "asc" as const : "desc" as const,
    gradeSort: params.get("gradeSort") === "asc" ? "asc" as const : "desc" as const,
  };
};

export const updateAnalyticsNavigation = (params: URLSearchParams, changes: Record<string, string | null>) => {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key, value]) => {
    if (value === null || value === "all" && key !== "risks" || value === "semester" || value === "desc") next.delete(key);
    else next.set(key, value);
  });
  return next;
};
