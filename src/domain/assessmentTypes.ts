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
  id: string; number: number; kind: AssessmentAttemptKind; date: string; startsAt: string; teacherId: string;
  chairId: string | null; memberIds: string[]; studentIds: string[]; results: AssessmentResult[];
  state: "draft" | "published"; createdAt: string; createdBy: string;
  publishedAt: string | null; publishedBy: string | null;
}
export interface Assessment {
  id: string; title: string; kind: AssessmentKind; subjectId: string | null; subjectName: string | null;
  groupId: string; groupName: string; period: string; supervisorId: string | null; recordBook: AssessmentRecordBookMetadata | null; roster: AssessmentStudent[]; attempts: AssessmentAttempt[];
}
export interface AssessmentHistoryEntry {
  id: string; assessmentId: string; attemptId: string; actorId: string; occurredAt: string;
  action: "created" | "attempt-created" | "results-saved" | "published" | "record-book-updated";
  results: AssessmentResult[] | null;
  recordBook: AssessmentRecordBookMetadata | null;
}
export interface AssessmentDocument { version: 2; revision: number; assessments: Assessment[]; history: AssessmentHistoryEntry[] }
export interface AssessmentCommandContext {
  actorId: string; actorRevision: number; expectedRevision: number;
  accountsRevision: number; groupRevision: number; subjectRevision: number;
}
export interface AssessmentAttemptDraft {
  date: string; startsAt: string; teacherId: string; chairId: string | null; memberIds: string[]; studentIds: string[];
}
export interface AssessmentDraft {
  title: string; kind: AssessmentKind; subjectId: string | null; groupId: string; period: string;
  attempt: AssessmentAttemptDraft;
  recordBook?: AssessmentRecordBookMetadata;
}
export type AssessmentCommand = AssessmentCommandContext & (
  | { type: "create"; draft: AssessmentDraft }
  | { type: "add-attempt"; assessmentId: string; kind: "retake" | "commission"; draft: AssessmentAttemptDraft }
  | { type: "save-results"; assessmentId: string; attemptId: string; results: AssessmentResult[] }
  | { type: "publish"; assessmentId: string; attemptId: string }
  | { type: "update-record-book"; assessmentId: string; recordBook: AssessmentRecordBookMetadata }
);
export interface AssessmentGroupOption { id: string; name: string; status?: "active" | "archived" }
export interface AssessmentSubjectOption { id: string; name: string }
export interface AssessmentTeacherOption { id: string; name: string }
export interface AssessmentStudentOption extends AssessmentStudent { groupId: string }
/** Read projections must already exclude other students' records and unpublished results. */
export interface AssessmentSnapshot {
  revision: number; accountsRevision: number; groupRevision: number; subjectRevision: number; actorRevision: number;
  assessments: Assessment[]; groups: AssessmentGroupOption[]; subjects: AssessmentSubjectOption[];
  teachers: AssessmentTeacherOption[]; students: AssessmentStudentOption[];
}
export interface AssessmentService {
  read(actorId: string): Promise<AssessmentSnapshot>;
  execute(command: AssessmentCommand): Promise<void>;
  subscribe(listener: () => void): () => void;
}
export const assessmentOutcomeLabel = (outcome: AssessmentOutcome | null): string => outcome === null ? "Не выставлено"
  : outcome.status === "graded" ? String(outcome.grade) : outcome.status === "passed" ? "Зачтено" : outcome.status === "failed" ? "Не зачтено" : "Неявка";
export const isSupervisedAssessment = (kind: AssessmentKind): boolean => kind === "thesis" || kind === "coursework";
