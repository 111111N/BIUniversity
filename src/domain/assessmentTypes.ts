import type { AcademicYear, AcademicTerm } from "./academicPeriods";
export const ASSESSMENTS_STORAGE_KEY = "bi-university-assessments-v1";
export interface AssessmentAcademicPeriod { catalogRevision: number; year: AcademicYear; term: AcademicTerm }
export interface AssessmentPeriodSelection { termId: string; expectedRevision: number }
export const ASSESSMENT_KIND_LABELS = {
  exam: "Экзамен", pass: "Зачёт", gradedPass: "Зачёт с оценкой", internship: "Практика", thesis: "ВКР", coursework: "Курсовая работа",
} as const;
export type AssessmentKind = keyof typeof ASSESSMENT_KIND_LABELS;
export const ATTEMPT_KIND_LABELS = { primary: "Основная сдача", retake: "Пересдача", commission: "Комиссионная пересдача" } as const;
export type AssessmentAttemptKind = keyof typeof ATTEMPT_KIND_LABELS;
export type AssessmentOutcome = { status: "graded"; grade: 2 | 3 | 4 | 5 } | { status: "passed" | "failed" | "absent" };
export interface AssessmentResult { studentId: string; outcome: AssessmentOutcome | null }
export interface AssessmentStudent { studentId: string; name: string; studentNumber: string | null }
export interface AssessmentRecordBookMetadata { semester: number; hours: number; category: "required" | "elective" }
export interface AssessmentAttempt {
  id: string; number: number; kind: AssessmentAttemptKind; date: string; startsAt: string; room?: string; teacherId: string;
  chairId: string | null; memberIds: string[]; studentIds: string[]; results: AssessmentResult[];
  state: "draft" | "published" | "cancelled"; createdAt: string; createdBy: string;
  publishedAt: string | null; publishedBy: string | null;
  cancellation?: { occurredAt: string; actorId: string; reason: string };
}
export interface Assessment {
  id: string; title: string; kind: AssessmentKind; subjectId: string | null; subjectName: string | null;
  groupId: string; groupName: string; period: string; supervisorId: string | null; recordBook: AssessmentRecordBookMetadata | null; roster: AssessmentStudent[]; attempts: AssessmentAttempt[];
  academicPeriod?: AssessmentAcademicPeriod;
}
export interface AssessmentHistoryEntry {
  id: string; assessmentId: string; attemptId: string; actorId: string; occurredAt: string;
  action: "created" | "attempt-created" | "results-saved" | "published" | "record-book-updated" | "attempt-updated" | "attempt-cancelled" | "supervisor-changed";
  results: AssessmentResult[] | null;
  recordBook: AssessmentRecordBookMetadata | null;
  assignment?: AssessmentAttemptDraft;
  assignmentOrigin?: "legacy-snapshot";
  reason?: string;
  previousSupervisorId?: string;
  academicPeriod?: AssessmentAcademicPeriod;
}
export interface AssessmentCorrection {
  id: string; assessmentId: string; attemptId: string; version: number; reason: string; openedAt: string; openedBy: string;
  state: "draft" | "published"; results: AssessmentResult[]; publishedAt: string | null; publishedBy: string | null;
}
export type AssessmentCorrectionSummary = Omit<AssessmentCorrection, "results">;
export interface AssessmentCorrectionEvent {
  id: string; correctionId: string; actorId: string; occurredAt: string;
  action: "opened" | "results-saved" | "published"; results: AssessmentResult[]; reason?: string;
}
export interface AssessmentDocument { version: 5 | 6; revision: number; assessments: Assessment[]; history: AssessmentHistoryEntry[]; corrections: AssessmentCorrection[]; correctionHistory: AssessmentCorrectionEvent[] }
export interface AssessmentCommandContext {
  actorId: string; actorRevision: number; expectedRevision: number;
  accountsRevision: number; groupRevision: number; subjectRevision: number;
}
export interface AssessmentAttemptDraft {
  date: string; startsAt: string; room?: string; teacherId: string; chairId: string | null; memberIds: string[]; studentIds: string[];
}
export interface AssessmentDraft {
  title: string; kind: AssessmentKind; subjectId: string | null; groupId: string; period: string;
  attempt: AssessmentAttemptDraft;
  recordBook?: AssessmentRecordBookMetadata;
  academicPeriod?: AssessmentPeriodSelection;
}
export type AssessmentCommand = AssessmentCommandContext & (
  | { type: "create"; draft: AssessmentDraft }
  | { type: "add-attempt"; assessmentId: string; kind: AssessmentAttemptKind; draft: AssessmentAttemptDraft }
  | { type: "update-attempt"; assessmentId: string; attemptId: string; draft: AssessmentAttemptDraft }
  | { type: "cancel-attempt"; assessmentId: string; attemptId: string; reason: string }
  | { type: "change-supervisor"; assessmentId: string; teacherId: string; reason: string }
  | { type: "open-correction"; assessmentId: string; attemptId: string; reason: string }
  | { type: "save-correction"; assessmentId: string; attemptId: string; correctionId: string; results: AssessmentResult[] }
  | { type: "publish-correction"; assessmentId: string; attemptId: string; correctionId: string }
  | { type: "save-results"; assessmentId: string; attemptId: string; results: AssessmentResult[] }
  | { type: "publish"; assessmentId: string; attemptId: string }
  | { type: "update-record-book"; assessmentId: string; recordBook: AssessmentRecordBookMetadata }
);
export interface AssessmentGroupOption { id: string; name: string; status?: "active" | "archived" }
export interface AssessmentSubjectOption { id: string; name: string; status?: "active" | "archived" }
export interface AssessmentTeacherOption { id: string; name: string }
export interface AssessmentStudentOption extends AssessmentStudent { groupId: string }
/** Read projections must already exclude other students' records and unpublished results. */
export interface AssessmentSnapshot {
  revision: number; accountsRevision: number; groupRevision: number; subjectRevision: number; actorRevision: number;
  assessments: Assessment[]; groups: AssessmentGroupOption[]; subjects: AssessmentSubjectOption[];
  teachers: AssessmentTeacherOption[]; students: AssessmentStudentOption[];
  manageableAttemptIds?: string[];
  manageableSupervisorAssessmentIds?: string[];
  corrections?: AssessmentCorrection[];
  correctionPublications?: AssessmentCorrectionSummary[];
  academicPeriods?: { revision: number; years: AcademicYear[]; terms: AcademicTerm[]; error?: string };
}
export interface AssessmentAttemptHistoryRequest extends AssessmentCommandContext { assessmentId: string; attemptId: string; page: number }
/** Assignment audit excludes grades and the full student roster. */
export interface AssessmentAttemptHistoryEntry extends Pick<AssessmentHistoryEntry, "id" | "actorId" | "occurredAt" | "assignmentOrigin" | "reason" | "previousSupervisorId"> {
  action: "created" | "attempt-created" | "attempt-updated" | "attempt-cancelled" | "supervisor-changed";
  assignment?: Omit<AssessmentAttemptDraft, "studentIds">;
}
export interface AssessmentAttemptHistoryPage {
  revision: number; items: AssessmentAttemptHistoryEntry[]; total: number; page: number; pages: number;
}
export interface AssessmentService {
  read(actorId: string): Promise<AssessmentSnapshot>;
  readAttemptHistory(request: AssessmentAttemptHistoryRequest): Promise<AssessmentAttemptHistoryPage>;
  exportStatement(request: AssessmentStatementRequest): Promise<AssessmentStatementFile>;
  execute(command: AssessmentCommand): Promise<void>;
  subscribe(listener: () => void): () => void;
}
export interface AssessmentStatementRequest extends AssessmentCommandContext { assessmentId: string; attemptId: string; version?: number }
export interface AssessmentStatementFile { filename: string; csv: string }
export const assessmentOutcomeLabel = (outcome: AssessmentOutcome | null): string => outcome === null ? "Не выставлено"
  : outcome.status === "graded" ? String(outcome.grade) : outcome.status === "passed" ? "Зачтено" : outcome.status === "failed" ? "Не зачтено" : "Неявка";
export const isSupervisedAssessment = (kind: AssessmentKind): boolean => kind === "thesis" || kind === "coursework";
