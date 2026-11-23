import type { SavedAssignment, SavedSubmission } from "./assignmentStorage";
import { getSubmissionConsistencyIssues } from "./submissionConsistency";
import { createBackupIssueCollector } from "./backupIssueCollector";
import { BACKUP_LIMITS, checkBackupAbort } from "./localBackup";

interface LearningSources {
  accountIds?: ReadonlySet<string>; subjectIds?: ReadonlySet<string>; groupIds?: ReadonlySet<string>;
  referenceAssignment?(target: "subject" | "group", id: string): void;
  unconfirmedAttachments?: boolean;
}

/** Inspect decoded saved rows. Missing histories, people and files are never filled from live stores. */
export async function inspectLearningDependencies(assignments: readonly SavedAssignment[] | undefined, submissions: readonly SavedSubmission[] | undefined, sources: LearningSources, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("заданиям и ответам");
  const cutoff = Date.parse(completedAt), workflows = new Set<string>(), assignmentIds = assignments && new Set(assignments.map(row => row.id));
  let steps = 0;
  const step = async () => {
    if (++steps > BACKUP_LIMITS.records) throw new Error("Заданий, ответов и попыток больше 25 000. Частичный результат не создан.");
    if (steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const dates = (kind: "assignments" | "submissions", recordId: string, value: object, fields: readonly string[]) => {
    for (const field of fields) {
      const time = (value as Record<string, unknown>)[field];
      if (typeof time === "string" && Date.parse(time) > cutoff) add({ kind, level: "error", code: `learning-${field}-after-cutoff`, recordId, message: "Сохранённая дата создания, отправки, проверки или изменения позже завершения архива. Будущие даты занятия и дедлайна не ограничиваются этой проверкой." });
    }
  };
  const attachment = (kind: "assignments" | "submissions", recordId: string, value: { attachmentId?: string; attachmentName?: string }) => {
    if (sources.unconfirmedAttachments && (value.attachmentId || value.attachmentName)) add({ kind, level: "review", code: "unchecked-selected-learning-attachment", recordId, referenceId: value.attachmentId, message: "Вложение выбранной записи требует согласованного файлового источника, схемы и принадлежности. Файлы исходного архива и браузера не подставлялись друг вместо друга." });
  };
  checkBackupAbort(signal);
  for (const [kind, rows] of [["assignments", assignments], ["submissions", submissions]] as const) if (rows?.length && !Number.isFinite(cutoff)) add({ kind, level: "review", code: "unchecked-learning-cutoff", message: "Время завершения архива не подтверждено для проверки дат заданий, ответов и попыток. Текущие часы не подставлялись." });
  for (const assignment of assignments ?? []) {
    await step();
    for (const [target, id, ids] of [["subject", assignment.subjectId, sources.subjectIds], ["group", assignment.groupId, sources.groupIds]] as const) {
      if (!id) continue;
      if (sources.referenceAssignment) sources.referenceAssignment(target, id);
      else if (!ids) add({ kind: "assignments", level: "review", code: `unchecked-${target}`, message: "Учебная область заданий не проверена: соответствующий выбранный справочник отсутствует или не согласован." });
      else if (!ids.has(id)) add({ kind: "assignments", level: "error", code: `missing-${target}`, referenceId: id, message: "Задание ссылается на отсутствующую дисциплину или группу в проверяемом наборе." });
    }
    if (!assignment.subjectId || !assignment.groupId) add({ kind: "assignments", level: "review", code: "legacy-identifiers", referenceId: assignment.id, message: "У старого задания отсутствует ID дисциплины или группы. Названия не заменяются данными браузера; соответствие требует отдельной проверки." });
    dates("assignments", assignment.id, assignment, ["createdAt", "updatedAt"]);
    if (assignment.createdAt && assignment.updatedAt && Date.parse(assignment.updatedAt) < Date.parse(assignment.createdAt)) add({ kind: "assignments", level: "error", code: "learning-update-before-creation", recordId: assignment.id, message: "Дата изменения задания раньше даты его создания. Даты не исправлялись." });
    attachment("assignments", assignment.id, assignment);
  }
  for (const submission of submissions ?? []) {
    await step();
    for (const finding of getSubmissionConsistencyIssues(submission)) add({ ...finding, kind: "submissions", referenceId: submission.id });
    if (!assignmentIds) add({ level: "review", kind: "submissions", code: "unchecked-assignment", message: "Связи ответов с заданиями не проверены: список заданий отсутствует или не читается." });
    else if (!assignmentIds.has(submission.assignmentId)) add({ level: "error", kind: "submissions", code: "missing-assignment", referenceId: submission.assignmentId, message: "Ответ ссылается на задание, которого нет в архиве." });
    if (!sources.accountIds) add({ level: "review", kind: "submissions", code: "unchecked-student", message: "Владельцы ответов не проверены: учётные записи отсутствуют или не читаются." });
    else if (!sources.accountIds.has(submission.studentId)) add({ level: "error", kind: "submissions", code: "missing-student", referenceId: submission.studentId, message: "Ответ ссылается на учётную запись студента, которой нет в архиве." });
    const workflow = JSON.stringify([submission.assignmentId, submission.studentId]);
    if (workflows.has(workflow)) add({ level: "review", kind: "submissions", code: "duplicate-workflow", referenceId: submission.id, message: "Для одного студента и задания найдено несколько карточек ответа. Нужно проверить, как сохранить их истории; записи не объединены." });
    workflows.add(workflow);
    dates("submissions", submission.id, submission, ["sentAt", "updatedAt"]);
    attachment("submissions", submission.id, submission);
    for (const attempt of submission.attempts ?? []) {
      await step();
      const recordId = JSON.stringify([submission.id, attempt.id]);
      dates("submissions", recordId, attempt, ["sentAt", "updatedAt", "reviewedAt"]);
      attachment("submissions", recordId, attempt);
    }
  }
  checkBackupAbort(signal);
  return issues;
}
