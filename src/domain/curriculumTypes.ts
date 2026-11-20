import type { EducationProgram, StudyForm } from "./educationDirectories";
import type { AssessmentAcademicPeriod } from "./assessmentTypes";

export const CURRICULA_KEY = "bi-university-curricula-v1";
export const CURRICULUM_HOURS = {
  lectures: "Лекции", practices: "Практические и семинарские занятия", labs: "Лабораторные",
  consultations: "Консультации", assessmentContact: "Контактная аттестация", otherContact: "Иная контактная работа",
  independent: "Самостоятельная работа, включая подготовку к аттестации", other: "Иные формы работы",
} as const;
export type CurriculumHours = Record<keyof typeof CURRICULUM_HOURS, number>;
export const CURRICULUM_CONTROLS = { exam: "Экзамен", pass: "Зачёт", gradedPass: "Зачёт с оценкой", coursework: "Курсовая работа", defence: "Защита", practiceReport: "Отчёт по практике" } as const;
export type CurriculumControl = keyof typeof CURRICULUM_CONTROLS;
export const CURRICULUM_CATEGORIES = { required: "Обязательная", elective: "Элективная", optional: "Факультативная" } as const;
export interface CurriculumEntry {
  id: string; subject: { id: string; revision: number; name: string; shortName: string };
  semester: number; category: keyof typeof CURRICULUM_CATEGORIES; controls: CurriculumControl[]; hours: CurriculumHours;
}
export interface CurriculumPlan {
  id: string; familyId: string; number: number; revision: number; sourceId: string | null;
  state: "draft" | "published"; name: string; program: EducationProgram; form: StudyForm;
  academicHourMinutes: 40 | 45; hoursPerCredit: number; entries: CurriculumEntry[];
}
export type CurriculumDraft = Pick<CurriculumPlan, "name" | "academicHourMinutes" | "hoursPerCredit" | "entries"> & { programId: string; formId: string };
export interface GroupCurriculum {
  group: { id: string; revision: number; name: string }; revision: number; planId: string;
  periods: Array<{ semester: number; period: AssessmentAcademicPeriod }>;
}
export type CurriculumEvent = { id: string; actorId: string; occurredAt: string } & (
  | { entity: "plan"; before: CurriculumPlan | null; after: CurriculumPlan }
  | { entity: "binding"; before: GroupCurriculum | null; after: GroupCurriculum }
);
export interface CurriculaDocument { version: 1; revision: number; plans: CurriculumPlan[]; bindings: GroupCurriculum[]; history: CurriculumEvent[] }
export interface CurriculumContext { actorId: string; actorRevision: number; expectedRevision: number; directoriesRevision: number; subjectsRevision: number; groupsRevision: number; periodsRevision: number }
export type CurriculumCommand = CurriculumContext & (
  | { type: "save"; planId?: string; planRevision?: number; draft: CurriculumDraft }
  | { type: "publish" | "new-version"; planId: string; planRevision: number }
  | { type: "bind"; groupId: string; groupRevision: number; bindingRevision: number; planId: string; periods: Array<{ semester: number; termId: string }> }
);
export const emptyCurricula = (): CurriculaDocument => ({ version: 1, revision: 0, plans: [], bindings: [], history: [] });
export const emptyCurriculumHours = (): CurriculumHours => ({ lectures: 0, practices: 0, labs: 0, consultations: 0, assessmentContact: 0, otherContact: 0, independent: 0, other: 0 });
export const curriculumTotal = (hours: CurriculumHours) => Object.values(hours).reduce((sum, value) => sum + Math.round(value * 100), 0) / 100;
export const curriculumContact = (hours: CurriculumHours) => (Math.round(curriculumTotal(hours) * 100) - Math.round(hours.independent * 100) - Math.round(hours.other * 100)) / 100;
