import type { Assessment, AssessmentCommandContext, AssessmentKind, AssessmentOutcome, AssessmentSnapshot } from "../../domain/assessmentTypes";
import { matchesSearchText } from "../../domain/search";

export const PAGE_SIZE = 20;
export const assessmentContext = (snapshot: AssessmentSnapshot, actorId: string): AssessmentCommandContext => ({
  actorId, actorRevision: snapshot.actorRevision, expectedRevision: snapshot.revision,
  accountsRevision: snapshot.accountsRevision, groupRevision: snapshot.groupRevision, subjectRevision: snapshot.subjectRevision,
});
export const assessmentContextChanged = (base: AssessmentCommandContext, snapshot: AssessmentSnapshot, actorId: string) => {
  const next = assessmentContext(snapshot, actorId);
  return (Object.keys(base) as (keyof AssessmentCommandContext)[]).some((key) => base[key] !== next[key]);
};
export const filterAssessments = (assessments: Assessment[], query: string, kind: AssessmentKind | "") => assessments.filter((item) => (!kind || item.kind === kind)
  && matchesSearchText([item.title, item.groupName, item.subjectName ?? "", item.period].join(" "), query));
export const paginate = <T,>(items: T[], requestedPage: number) => {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pages);
  return { page, pages, items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: items.length };
};
export const outcomeValue = (outcome: AssessmentOutcome | null) => outcome === null ? "" : outcome.status === "graded" ? String(outcome.grade) : outcome.status;
export const parseOutcome = (value: string): AssessmentOutcome | null => {
  if (!value) return null;
  if (["2", "3", "4", "5"].includes(value)) return { status: "graded", grade: Number(value) as 2 | 3 | 4 | 5 };
  if (value === "passed" || value === "failed" || value === "absent") return { status: value };
  throw new Error("Неизвестный результат аттестации.");
};
export const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}` : value;
export const todayDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map((part) => parts.find((entry) => entry.type === part)?.value).join("-");
};
