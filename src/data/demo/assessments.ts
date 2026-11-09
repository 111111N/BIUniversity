import { getStudentGroupId, isAccountActive } from "../../domain/accounts";
import { applyAssessmentCommand, type AssessmentDomainContext } from "../../domain/assessments";
import { ASSESSMENT_KIND_LABELS, type AssessmentCommand, type AssessmentDocument, type AssessmentKind, type AssessmentOutcome } from "../../domain/assessmentTypes";

type WithoutContext<Command> = Command extends AssessmentCommand ? Omit<Command, keyof import("../../domain/assessmentTypes").AssessmentCommandContext> : never;
type DemoOperation = WithoutContext<AssessmentCommand>;

const DEMO_PERIOD = "Демонстрационный учебный период";
const demoTitle = (kind: AssessmentKind, published: boolean) => `${ASSESSMENT_KIND_LABELS[kind]} — ${published ? "опубликованный пример" : "черновик"}`;

/** Repair only exact shipped demo literals after validation; audit snapshots contain neither field. */
export const repairAssessmentDemoText = (document: AssessmentDocument): AssessmentDocument => ({
  ...document,
  assessments: document.assessments.map((assessment) => {
    const published = assessment.id === `demo-assessment-v1:${assessment.kind}:published`;
    if (!published && assessment.id !== `demo-assessment-v1:${assessment.kind}:draft`) return assessment;
    const oldTitle = `${ASSESSMENT_KIND_LABELS[assessment.kind]} В· ${published ? "РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅС‹Р№ РїСЂРёРјРµСЂ" : "С‡РµСЂРЅРѕРІРёРє"}`;
    return {
      ...assessment,
      title: assessment.title === oldTitle ? demoTitle(assessment.kind, published) : assessment.title,
      period: assessment.period === "Р”РµРјРѕРЅСЃС‚СЂР°С†РёРѕРЅРЅС‹Р№ СѓС‡РµР±РЅС‹Р№ РїРµСЂРёРѕРґ" ? DEMO_PERIOD : assessment.period,
    };
  }),
});

export const appendAssessmentDemo = (original: AssessmentDocument, context: AssessmentDomainContext, now: Date) => {
  let state = original;
  const configurator = context.accounts.find((account) => account.id === "configurator-demo" && account.role === "configurator" && isAccountActive(account));
  const teacher = context.accounts.find((account) => account.id === "teacher-elena-volkova" && account.role === "teacher" && isAccountActive(account));
  const student = context.accounts.find((account) => account.id === "anna-smirnova" && isAccountActive(account) && (account.enrollmentStatus ?? "studying") === "studying");
  const groupId = student && getStudentGroupId(student);
  const subjectIds = teacher?.memberships.filter((entry) => groupId && entry.groupIds.includes(groupId)).map((entry) => entry.subjectId).filter((id) => context.subjects.some((subject) => subject.id === id)) ?? [];
  const member = context.accounts.find((account) => account.role === "teacher" && account.id !== teacher?.id && isAccountActive(account));
  if (!configurator || !teacher || !student || !groupId || !subjectIds.length || !member || !context.groups.some((group) => group.id === groupId && group.status !== "archived")) throw new Error("Демонстрационные участники, назначения или группа недоступны. Существующие аттестации сохранены.");
  const occurredAt = new Date(Math.max(now.getTime(), Date.parse(state.history.at(-1)?.occurredAt ?? now.toISOString()))).toISOString();
  const kinds = Object.keys(ASSESSMENT_KIND_LABELS) as AssessmentKind[];
  for (const [index, kind] of kinds.entries()) {
    for (const published of [true, false]) {
      const assessmentId = `demo-assessment-v1:${kind}:${published ? "published" : "draft"}`;
      if (state.assessments.some((entry) => entry.id === assessmentId)) continue;
      const count = kind === "exam" ? 3 : kind === "pass" ? 2 : 1;
      for (let number = 1; number <= count; number++) {
        const attemptId = `${assessmentId}:attempt:${number}`;
        const execute = (actor: typeof teacher, operation: DemoOperation) => {
          state = applyAssessmentCommand(state, { ...operation, actorId: actor.id, actorRevision: actor.revision, expectedRevision: state.revision, accountsRevision: context.accountsRevision, groupRevision: context.groupRevision, subjectRevision: context.subjectRevision }, context, { assessmentId, attemptId, historyId: `${attemptId}:${operation.type}`, occurredAt });
        };
        const draft = { date: new Date(now.getTime() - (count - number + 1) * 86_400_000).toISOString().slice(0, 10), startsAt: "09:00", room: "A-101", teacherId: teacher.id, chairId: number === 3 ? teacher.id : null, memberIds: number === 3 ? [member.id] : [], studentIds: [student.id] };
        if (number === 1) execute(configurator, { type: "create", draft: { title: demoTitle(kind, published), kind, subjectId: subjectIds[index % subjectIds.length], groupId, period: DEMO_PERIOD, recordBook: { semester: index + 1, hours: [108, 72, 144, 216, 432, 36][index], category: kind === "gradedPass" ? "elective" : "required" }, attempt: draft } });
        else execute(configurator, { type: "add-attempt", assessmentId, kind: number === 3 ? "commission" : "retake", draft });
        const outcome: AssessmentOutcome = number < count ? kind === "pass" ? { status: "failed" } : number === 1 ? { status: "absent" } : { status: "graded", grade: 2 } : kind === "pass" ? { status: "passed" } : { status: "graded", grade: 4 };
        execute(teacher, { type: "save-results", assessmentId, attemptId, results: [{ studentId: student.id, outcome }] });
        if (published || number < count) execute(teacher, { type: "publish", assessmentId, attemptId });
      }
    }
  }
  return state;
};

