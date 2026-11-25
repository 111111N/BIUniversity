import type { AcademicMembership } from "./accounts";
import { lessonTypeLabels, type LessonType } from "./academic";
import { isAcademicCalendarDate } from "./academicPeriods";
import { validateAssessmentAcademicPeriod } from "./assessmentPeriods";
import type { AssessmentAcademicPeriod } from "./assessmentTypes";

export const TEACHING_ASSIGNMENTS_KEY = "bi-university-teaching-assignments-v1";
export interface TeachingPeriod { period: AssessmentAcademicPeriod; types: LessonType[] }
export interface TeachingAssignment {
  id: string; revision: number; teacherId: string; subjectId: string; groupId: string;
  mode: "general" | "periods"; periods: TeachingPeriod[];
}
export interface TeachingAssignmentEvent {
  id: string; actorId: string; occurredAt: string;
  before: TeachingAssignment | null; after: TeachingAssignment;
}
export interface TeachingAssignmentsDocument { version: 1; revision: number; assignments: TeachingAssignment[]; history: TeachingAssignmentEvent[] }
export interface TeachingAssignmentContext {
  actorId: string; actorRevision: number; expectedRevision: number; accountsRevision: number;
  subjectsRevision: number; groupsRevision: number; periodsRevision: number; scheduleRevision: number; calendarRevision: number;
}
export interface TeachingAssignmentCommand extends TeachingAssignmentContext {
  teacherId: string; subjectId: string; groupId: string; assignmentRevision: number;
  mode: TeachingAssignment["mode"]; periods: Array<{ termId: string; types: LessonType[] }>;
}
export const emptyTeachingAssignments = (): TeachingAssignmentsDocument => ({ version: 1, revision: 0, assignments: [], history: [] });
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
export const sameTeachingData = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => sameTeachingData(value, b[index]));
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && sameTeachingData(left[key], right[key]));
};
function fail(): never { throw new Error("Назначения по типам занятий повреждены или имеют неподдерживаемый формат. Исходный документ сохранён."); }
const validateRecord = (value: unknown): TeachingAssignment => {
  if (!exact(value, ["id", "revision", "teacherId", "subjectId", "groupId", "mode", "periods"]) || ![value.id, value.teacherId, value.subjectId, value.groupId].every(text) || !positive(value.revision)
    || !["general", "periods"].includes(String(value.mode)) || !Array.isArray(value.periods) || value.periods.length > 200 || value.mode === "general" && value.periods.length) fail();
  const record = value as unknown as TeachingAssignment;
  let previousEnd = "";
  const ids = new Set<string>();
  for (const entry of record.periods) {
    if (!exact(entry, ["period", "types"]) || !Array.isArray(entry.types) || !entry.types.length || entry.types.length > 3 || !entry.types.every(type => Object.hasOwn(lessonTypeLabels, type)) || new Set(entry.types).size !== entry.types.length) fail();
    const period = validateAssessmentAcademicPeriod(entry.period);
    if (ids.has(period.term.id) || period.term.startsOn <= previousEnd) fail();
    ids.add(period.term.id); previousEnd = period.term.endsOn;
  }
  return record;
};
export const decodeTeachingAssignments = (raw: string): TeachingAssignmentsDocument => {
  if (raw.length > 16 * 1024 * 1024) fail();
  const value: unknown = JSON.parse(raw);
  if (!exact(value, ["version", "revision", "assignments", "history"]) || value.version !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !Array.isArray(value.assignments) || value.assignments.length > 10000 || !Array.isArray(value.history) || value.history.length > 20000 || value.revision !== value.history.length) fail();
  const replay = new Map<string, TeachingAssignment>(), eventIds = new Set<string>(), identities = new Map<string, string>();
  let previousTime = "";
  for (const event of value.history) {
    if (!exact(event, ["id", "actorId", "occurredAt", "before", "after"]) || !text(event.id) || !text(event.actorId) || eventIds.has(event.id) || typeof event.occurredAt !== "string" || !Number.isFinite(Date.parse(event.occurredAt)) || new Date(event.occurredAt).toISOString() !== event.occurredAt || event.occurredAt < previousTime) fail();
    const after = validateRecord(event.after), before = event.before === null ? null : validateRecord(event.before);
    const identity = JSON.stringify([after.teacherId, after.subjectId, after.groupId]);
    if ((identities.has(identity) && identities.get(identity) !== after.id) || !sameTeachingData(replay.get(after.id) ?? null, before) || after.revision !== (before?.revision ?? 0) + 1
      || before && (before.teacherId !== after.teacherId || before.subjectId !== after.subjectId || before.groupId !== after.groupId || sameTeachingData({ mode: before.mode, periods: before.periods }, { mode: after.mode, periods: after.periods }))) fail();
    eventIds.add(event.id); previousTime = event.occurredAt; identities.set(identity, after.id); replay.set(after.id, after);
  }
  const records = value.assignments.map(validateRecord);
  if (records.length !== replay.size || new Set(records.map(row => row.id)).size !== records.length || records.some(row => !sameTeachingData(row, replay.get(row.id)))) fail();
  return value as unknown as TeachingAssignmentsDocument;
};
export const findTeachingAssignment = (document: Pick<TeachingAssignmentsDocument, "assignments">, teacherId: string, subjectId: string, groupId: string) => document.assignments.find(row => row.teacherId === teacherId && row.subjectId === subjectId && row.groupId === groupId);
export const hasGeneralTeachingMembership = (teacher: { memberships: AcademicMembership[] }, subjectId: string, groupId: string) => teacher.memberships.some(row => row.subjectId === subjectId && row.groupIds.includes(groupId));
// Date/type coverage alone does not establish the teacher's general membership or authority.
export const teachingAssignmentAllowsLesson = (assignment: TeachingAssignment | undefined, lesson: { type: LessonType; date: string }) => {
  if (!isAcademicCalendarDate(lesson.date) || !Object.hasOwn(lessonTypeLabels, lesson.type)) return false;
  return !assignment || assignment.mode === "general" || assignment.periods.some(entry => entry.types.includes(lesson.type) && entry.period.term.startsOn <= lesson.date && entry.period.term.endsOn >= lesson.date);
};
export const canTeachLesson = (document: Pick<TeachingAssignmentsDocument, "assignments">, teacher: { id: string; memberships: AcademicMembership[] }, lesson: { subjectId: string; groupId: string; type: LessonType; date: string }) => {
  if (!hasGeneralTeachingMembership(teacher, lesson.subjectId, lesson.groupId)) return false;
  const assignment = findTeachingAssignment(document, teacher.id, lesson.subjectId, lesson.groupId);
  return teachingAssignmentAllowsLesson(assignment, lesson);
};
export interface ScheduleTeacher { id: string; memberships: AcademicMembership[]; teachingAssignments?: TeachingAssignment[] }
export const canScheduleTeacher = (teacher: ScheduleTeacher, lesson: Parameters<typeof canTeachLesson>[2]) => canTeachLesson({ assignments: teacher.teachingAssignments ?? [] }, teacher, lesson);
export const appendTeachingAssignment = (source: TeachingAssignmentsDocument, after: TeachingAssignment, metadata: { id: string; actorId: string; occurredAt: string }): TeachingAssignmentsDocument => {
  const before = source.assignments.find(row => row.id === after.id) ?? null;
  return decodeTeachingAssignments(JSON.stringify({ ...source, revision: source.revision + 1, assignments: [...source.assignments.filter(row => row.id !== after.id), after], history: [...source.history, { ...metadata, before, after }] }));
};
