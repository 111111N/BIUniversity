import { isAccountActive, type PortalAccount } from "./accounts";
import type { AssessmentDocument } from "./assessmentTypes";
import type { AdministrationIssue } from "./administrationChecks";

export interface AssessmentDependencySources {
  accounts: readonly PortalAccount[];
  groups: readonly { id: string; status?: "active" | "archived" }[];
  subjects: readonly { id: string }[];
}

/** Current availability is actionable for drafts; published assignments remain historical snapshots. */
export function inspectAssessmentDependencies(document: AssessmentDocument, sources: AssessmentDependencySources): AdministrationIssue[] {
  if (!document.assessments.length) return [];
  const accounts = new Map(sources.accounts.map((account) => [account.id, account]));
  const groups = new Map(sources.groups.map((group) => [group.id, group]));
  const subjects = new Set(sources.subjects.map((subject) => subject.id));
  const historyActors = new Map<string, Set<string>>();
  const correctionAssessments = new Map(document.corrections.map((entry) => [entry.id, entry.assessmentId]));
  const activeCorrections = new Set(document.corrections.filter((entry) => entry.state === "draft").map((entry) => entry.attemptId));
  for (const event of document.correctionHistory) {
    const assessmentId = correctionAssessments.get(event.correctionId);
    if (assessmentId) { const actors = historyActors.get(assessmentId) ?? new Set<string>(); actors.add(event.actorId); historyActors.set(assessmentId, actors); }
  }
  for (const entry of document.history) {
    let actors = historyActors.get(entry.assessmentId);
    if (!actors) { actors = new Set(); historyActors.set(entry.assessmentId, actors); }
    actors.add(entry.actorId);
    if (entry.previousSupervisorId !== undefined) actors.add(entry.previousSupervisorId);
    if (entry.assignment) {
      actors.add(entry.assignment.teacherId);
      if (entry.assignment.chairId !== null) actors.add(entry.assignment.chairId);
      for (const memberId of entry.assignment.memberIds) actors.add(memberId);
    }
  }
  const issues: AdministrationIssue[] = [];
  for (const assessment of document.assessments) {
    const group = groups.get(assessment.groupId);
    const attempts = new Map(assessment.attempts.map((attempt) => [attempt.id, attempt]));
    const common = { kind: "assessment-dependency" as const, title: assessment.title, assessmentId: assessment.id,
      groupId: group?.id, groupArchived: group?.status === "archived",
      subjectId: assessment.subjectId !== null && subjects.has(assessment.subjectId) ? assessment.subjectId : undefined,
    };
    const report = (code: string, referenceId: string, detail: string, level: AdministrationIssue["level"] = "action", attemptId?: string, accountId?: string) => {
      const attempt = attemptId === undefined ? undefined : attempts.get(attemptId);
      issues.push({ ...common, id: `assessment-dependency:${JSON.stringify([assessment.id, code, referenceId])}`, level,
        detail: `${assessment.groupName} · ${assessment.period}${attempt ? ` · попытка ${attempt.number} (${attempt.startsAt}, Москва)` : ""}. ${detail}`,
        lessonDate: attempt?.date, attemptId, accountId,
      });
    };
    if (!group) report("group", assessment.groupId, "Группа отсутствует в справочнике. Зафиксированный состав ведомости сохранён; проверьте источник группы.");
    if (assessment.subjectId !== null && !subjects.has(assessment.subjectId)) report("subject", assessment.subjectId, "Дисциплина отсутствует в справочнике. Название и результаты ведомости сохранены; проверьте источник дисциплины.");
    const participants = new Set(assessment.roster.map((student) => student.studentId));
    if (assessment.supervisorId !== null) participants.add(assessment.supervisorId);
    for (const attempt of assessment.attempts) {
      participants.add(attempt.teacherId); participants.add(attempt.createdBy);
      if (attempt.publishedBy !== null) participants.add(attempt.publishedBy);
      if (attempt.chairId !== null) participants.add(attempt.chairId);
      for (const id of attempt.memberIds) participants.add(id);
      if (attempt.state !== "draft" && !activeCorrections.has(attempt.id)) continue;
      const teacher = accounts.get(attempt.teacherId);
      if (teacher && (teacher.role !== "teacher" || !isAccountActive(teacher))) report("teacher-access", attempt.id,
        `Ответственный преподаватель ${teacher.name} (${teacher.login}) ${teacher.role !== "teacher" ? "имеет другой тип учётной записи" : "заблокирован"} и не может заполнить или опубликовать эту ведомость. Проверьте учётную запись и назначение.`, "action", attempt.id, teacher.id);
      const unavailableCommission = [attempt.chairId, ...attempt.memberIds].filter((id): id is string => id !== null).some((id) => {
        const member = accounts.get(id);
        return member !== undefined && (member.role !== "teacher" || !isAccountActive(member));
      });
      if (unavailableCommission && attempt.state === "draft") report("commission-access", attempt.id, "У председателя или члена комиссии изменён тип учётной записи либо заблокирован вход. Проверьте актуальность состава комиссии; исторические назначения не изменены.", "review", attempt.id);
      if (group?.status === "archived") report("archived-group", attempt.id, `Группа находится в архиве, но ${attempt.state === "published" ? "исправление ведомости ещё не опубликовано" : "ведомость ещё не опубликована"}. Проверьте незавершённую аттестацию; архивирование группы само по себе её не отменяет.`, "review", attempt.id);
    }
    for (const id of historyActors.get(assessment.id) ?? []) participants.add(id);
    for (const id of participants) if (!accounts.has(id)) report("account", id,
      `Учётная запись участника или автора истории (${id}) отсутствует. Зафиксированные участники, результаты и история не изменены. Проверьте исходные данные; совпадение ФИО не заменяет ID.`);
  }
  return issues;
}
