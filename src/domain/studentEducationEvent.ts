import { isStudentEnrollmentStatus, type StudentEnrollmentStatus } from "./studentEnrollment";

export interface EducationEventDetails { effectiveDate: string; basis: string; documentNumber?: string; documentDate?: string }
export interface EducationState { groupId: string; groupName: string; enrollment: StudentEnrollmentStatus }
export type EducationEventKind = "admitted" | "transferred" | "graduated" | "withdrawn" | "reinstated";
export const EDUCATION_EVENT_LABELS: Record<EducationEventKind, string> = { admitted: "Зачисление подтверждено", transferred: "Перевод", graduated: "Выпуск", withdrawn: "Отчисление", reinstated: "Обучение возобновлено" };
export interface StudentEducationEvent extends EducationEventDetails { id: string; accountId: string; actorId: string; registeredAt: string; accountRevisionAfter: number; kind: EducationEventKind; before?: EducationState; after: EducationState; auditId: string; batchId?: string }
export const getMoscowDateKey = (instant = new Date().toISOString()) => {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};
export const isEducationDate = (value: unknown): value is string => typeof value === "string" && /^[12]\d{3}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export type EducationEventField = keyof EducationEventDetails;
export type EducationDetailsError = { field: EducationEventField; message: string };
export const getEducationDetailsErrors = (details: EducationEventDetails, registeredAt: string): EducationDetailsError[] => {
  const today = getMoscowDateKey(registeredAt);
  const dateError: EducationDetailsError = { field: "effectiveDate", message: "Дата действия должна быть корректной, за сегодня или прошедший день." };
  if (!details) return [dateError];
  const errors: EducationDetailsError[] = [];
  if (!isEducationDate(details.effectiveDate) || details.effectiveDate > today) errors.push(dateError);
  if (typeof details.basis !== "string" || details.basis.trim().length < 3 || details.basis.trim().length > 500) errors.push({ field: "basis", message: "Укажите основание события: от 3 до 500 символов." });
  if (details.documentNumber !== undefined && (typeof details.documentNumber !== "string" || details.documentNumber.trim().length > 80)) errors.push({ field: "documentNumber", message: "Номер документа: не более 80 символов." });
  if (details.documentDate !== undefined && details.documentDate !== "" && (!isEducationDate(details.documentDate) || details.documentDate > today)) errors.push({ field: "documentDate", message: "Укажите корректную дату документа, не позднее сегодняшнего дня." });
  return errors;
};
export const normalizeEducationDetails = (details: EducationEventDetails, registeredAt: string): EducationEventDetails => {
  const errors = getEducationDetailsErrors(details, registeredAt);
  if (errors.length) throw new Error(errors[0].message);
  return { effectiveDate: details.effectiveDate, basis: details.basis.trim(), ...(details.documentNumber?.trim() ? { documentNumber: details.documentNumber.trim() } : {}), ...(details.documentDate ? { documentDate: details.documentDate } : {}) };
};
export const sameEducationState = (a: EducationState, b: EducationState) => a.groupId === b.groupId && a.enrollment === b.enrollment;
export const educationContinuationError = (events: StudentEducationEvent[], current: EducationState, effectiveDate: string) => {
  const last = events.at(-1);
  if (!last) return "";
  if (!sameEducationState(last.after, current)) return "Текущее состояние расходится с последним событием обучения. Проверьте группу и состояние в учётке.";
  if (effectiveDate < last.effectiveDate) return `Дата раньше последнего события (${last.effectiveDate}). Исправьте дату; прошлая история не перезаписывается.`;
  return "";
};
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const state = (value: unknown): value is EducationState => record(value) && typeof value.groupId === "string" && Boolean(value.groupId.trim()) && typeof value.groupName === "string" && Boolean(value.groupName.trim()) && isStudentEnrollmentStatus(value.enrollment);
export const isStudentEducationEvent = (value: unknown): value is StudentEducationEvent => {
  if (!record(value) || ["id", "accountId", "actorId", "auditId"].some((key) => typeof value[key] !== "string" || !String(value[key]).trim()) || typeof value.registeredAt !== "string" || !Number.isFinite(Date.parse(value.registeredAt)) || !Number.isSafeInteger(value.accountRevisionAfter) || Number(value.accountRevisionAfter) < 1 || !Object.hasOwn(EDUCATION_EVENT_LABELS, String(value.kind)) || !state(value.after) || (value.before !== undefined && !state(value.before)) || (value.batchId !== undefined && (typeof value.batchId !== "string" || !value.batchId.trim()))) return false;
  try { normalizeEducationDetails(value as unknown as EducationEventDetails, value.registeredAt); } catch { return false; }
  if (value.kind === "admitted") return value.before === undefined && value.after.enrollment === "studying";
  if (!state(value.before)) return false;
  if (value.kind === "transferred") return value.before.enrollment === "studying" && value.after.enrollment === "studying" && value.before.groupId !== value.after.groupId;
  if (value.before.groupId !== value.after.groupId) return false;
  if (value.kind === "reinstated") return value.before.enrollment !== "studying" && value.after.enrollment === "studying";
  return value.after.enrollment === value.kind && value.before.enrollment !== value.after.enrollment;
};
export interface EducationPeriod { from: string; until: string | null; state: EducationState; eventId: string }
export const getEducationPeriods = (events: StudentEducationEvent[]): EducationPeriod[] => events.flatMap((event, index) => {
  const until = events[index + 1]?.effectiveDate ?? null;
  return until === event.effectiveDate ? [] : [{ from: event.effectiveDate, until, state: event.after, eventId: event.id }];
});
export const getEducationStateAt = (events: StudentEducationEvent[], date: string): EducationState | undefined => {
  if (!isEducationDate(date)) return undefined;
  for (let index = events.length - 1; index >= 0; index--) if (events[index].effectiveDate <= date) return events[index].after;
  return undefined;
};
