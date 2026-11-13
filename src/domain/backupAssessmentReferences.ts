import { decodeAccountsDocument } from "./accounts";
import type { AssessmentDocument } from "./assessmentTypes";
import { decodeGroupCatalog } from "./groupCatalog";
import { decodeSubjectCatalog } from "./subjectCatalog";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget, encodeBackupValue } from "./localBackup";
import { canonicalBackupValue } from "./localBackupValidation";
import type { BackupRecordEntries } from "./backupRecordComparison";
import { ACADEMIC_PERIODS_STORAGE_KEY, decodeAcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";

export type AssessmentReferenceTarget = "accounts" | "groups" | "subjects";
export interface AssessmentReferenceChoice { collection: AssessmentReferenceTarget; id: string; version: "archive" | "browser" }
export interface AssessmentReferenceIssue {
  code: "invalid-source" | "missing-source" | "missing-reference" | "unresolved-reference" | "invalid-choice";
  target?: AssessmentReferenceTarget | "periods"; referenceId?: string; message: string;
}
export interface AssessmentReferenceReview {
  scope: "assessment-reference-presence";
  status: "references-present" | "blocked";
  counts: { references: number; found: number; missing: number; unresolved: number; unavailable: number };
  issues: AssessmentReferenceIssue[];
}
export const ASSESSMENT_REFERENCE_LABELS: Record<AssessmentReferenceTarget | "periods", string> = { accounts: "Учётная запись", groups: "Группа", subjects: "Дисциплина", periods: "Учебный период" };
const DEFINITIONS = {
  accounts: { key: "bi-university-accounts-v1", prefix: "bi-university-accounts-", read: (raw: string) => decodeAccountsDocument(raw).accounts },
  groups: { key: "bi-university-group-catalog-v1", prefix: "bi-university-group-catalog-", read: (raw: string) => decodeGroupCatalog(raw).groups },
  subjects: { key: "bi-university-subject-catalog-v1", prefix: "bi-university-subject-catalog-", read: (raw: string) => decodeSubjectCatalog(raw).subjects },
} as const;

/** Checks exact IDs in selected cards only; does not infer historical roles or membership. */
export async function inspectSelectedAssessmentReferences(
  document: AssessmentDocument, archive: BackupRecordEntries, browser: BackupRecordEntries,
  choices: readonly AssessmentReferenceChoice[], signal?: AbortSignal,
): Promise<AssessmentReferenceReview> {
  checkBackupAbort(signal);
  const result: AssessmentReferenceReview = { scope: "assessment-reference-presence", status: "blocked", counts: { references: 0, found: 0, missing: 0, unresolved: 0, unavailable: 0 }, issues: [] };
  const refs: Record<AssessmentReferenceTarget, Set<string>> = { accounts: new Set(), groups: new Set(), subjects: new Set() };
  let steps = 0;
  const step = async () => { if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const account = (id: string | null | undefined) => { if (id !== null && id !== undefined) refs.accounts.add(id); };
  for (const assessment of document.assessments) {
    await step(); refs.groups.add(assessment.groupId);
    if (assessment.subjectId !== null) refs.subjects.add(assessment.subjectId);
    account(assessment.supervisorId);
    for (const student of assessment.roster) { await step(); account(student.studentId); }
    for (const attempt of assessment.attempts) {
      await step(); account(attempt.teacherId); account(attempt.createdBy); account(attempt.publishedBy); account(attempt.chairId);
      for (const member of attempt.memberIds) { await step(); account(member); }
    }
  }
  for (const event of document.history) {
    await step(); account(event.actorId); account(event.previousSupervisorId);
    if (event.assignment) {
      account(event.assignment.teacherId); account(event.assignment.chairId);
      for (const member of event.assignment.memberIds) { await step(); account(member); }
    }
  }
  for (const correction of document.corrections) { await step(); account(correction.openedBy); account(correction.publishedBy); }
  for (const event of document.correctionHistory) { await step(); account(event.actorId); }
  result.counts.references = Object.values(refs).reduce((sum, ids) => sum + ids.size, 0);
  const selected = new Map<string, AssessmentReferenceChoice>();
  for (const choice of choices) {
    await step(); const key = JSON.stringify([choice.collection, choice.id]);
    if (!Object.hasOwn(DEFINITIONS, choice.collection) || !["archive", "browser"].includes(choice.version) || selected.has(key)) {
      result.issues.push({ code: "invalid-choice", message: "Выбор справочников устарел или содержит неоднозначные версии. Проверьте файл и выбор заново." });
      return result;
    }
    selected.set(key, choice);
  }
  const textBudget = createBackupBudget(), valueBudget = createBackupBudget();
  const read = async (entries: BackupRecordEntries, target: AssessmentReferenceTarget) => {
    const definition = DEFINITIONS[target], matches = [];
    for (const entry of entries) {
      await step(); if (!entry.key.startsWith(definition.prefix)) continue;
      addBackupText(textBudget, entry.key); addBackupText(textBudget, entry.raw); matches.push(entry);
    }
    if (!matches.length) return null;
    if (matches.length !== 1 || matches[0].key !== definition.key) throw new Error("Unsupported reference source");
    const rows = definition.read(matches[0].raw), indexed = new Map<string, { row: object; fingerprint?: string }>();
    for (const row of rows) {
      await step();
      if (++valueBudget.records > BACKUP_LIMITS.records) throw new Error("Too many reference records");
      if (refs[target].has(row.id)) indexed.set(row.id, { row });
    }
    return indexed;
  };
  for (const target of Object.keys(DEFINITIONS) as AssessmentReferenceTarget[]) {
    const ids = refs[target];
    if (!ids.size) continue;
    let left: Awaited<ReturnType<typeof read>>, right: Awaited<ReturnType<typeof read>>;
    try { left = await read(archive, target); right = await read(browser, target); }
    catch (error) {
      checkBackupAbort(signal);
      if (!(error instanceof Error)) throw error;
      result.counts.unavailable += ids.size;
      result.issues.push({ code: "invalid-source", target, message: "Один из справочников не читается, превышает предел проверки или содержит повторяющийся/неподдерживаемый ключ. Ссылки не подтверждены; другой источник не подставлялся." }); continue;
    }
    if (!left && !right) {
      result.counts.unavailable += ids.size;
      result.issues.push({ code: "missing-source", target, message: "Справочник отсутствует и в архиве, и в снимке браузера. Встроенные примеры и совпадения названий не использовались." }); continue;
    }
    for (const id of ids) {
      await step(); const a = left?.get(id), b = right?.get(id), choice = selected.get(JSON.stringify([target, id]));
      if (!a && !b) {
        result.counts.missing++; result.issues.push({ code: "missing-reference", target, referenceId: id, message: "ID участника, автора или учебного справочника не найден ни в одной сохранённой версии. Сопоставление по имени не выполнялось." }); continue;
      }
      if (a && b) {
        a.fingerprint ??= canonicalBackupValue(await encodeBackupValue(a.row, valueBudget, signal));
        b.fingerprint ??= canonicalBackupValue(await encodeBackupValue(b.row, valueBudget, signal));
        if (a.fingerprint !== b.fingerprint) {
          if (!choice) {
            result.counts.unresolved++; result.issues.push({ code: "unresolved-reference", target, referenceId: id, message: "Версии связанной карточки различаются. Просмотрите значения и выберите источник в сравнении справочника." }); continue;
          }
        } else if (choice) {
          result.counts.unresolved++; result.issues.push({ code: "invalid-choice", target, referenceId: id, message: "Выбор больше не соответствует различающимся версиям карточки. Проверьте файл заново." }); continue;
        }
      } else if (choice) {
        result.counts.unresolved++; result.issues.push({ code: "invalid-choice", target, referenceId: id, message: "Карточка сохранилась только в одном источнике, но для неё остался выбор конфликта. Проверьте файл заново." }); continue;
      }
      result.counts.found++;
    }
  }
  const linked = document.assessments.filter(row => row.academicPeriod);
  if (linked.length) {
    result.counts.references += linked.length;
    const readPeriods = (entries: BackupRecordEntries) => {
      const matches = entries.filter(row => row.key.startsWith("bi-university-academic-periods-"));
      if (!matches.length) return null;
      if (matches.length !== 1 || matches[0].key !== ACADEMIC_PERIODS_STORAGE_KEY) throw new Error("Unsupported period source");
      addBackupText(textBudget, matches[0].raw); return decodeAcademicPeriodsDocument(matches[0].raw);
    };
    try {
      const left = readPeriods(archive), right = readPeriods(browser);
      if (!left && !right) {
        result.counts.unavailable += linked.length;
        result.issues.push({ code: "missing-source", target: "periods", message: "Справочник учебных периодов отсутствует в обоих источниках. Текст периода и номер семестра не заменяют сохранённую связь." });
      } else if (left && right && canonicalBackupValue(await encodeBackupValue(left, valueBudget, signal)) !== canonicalBackupValue(await encodeBackupValue(right, valueBudget, signal))) {
        result.counts.unresolved += linked.length;
        result.issues.push({ code: "unresolved-reference", target: "periods", message: "Версии справочника периодов различаются. Выбор и согласование его записей с историей ещё не реализованы; учебная область выбранных аттестаций не подтверждена." });
      } else {
        const catalog = right ?? left!;
        const periodExists = createAssessmentPeriodHistoryLookup(catalog);
        for (const assessment of linked) {
          await step();
          if (periodExists(assessment.academicPeriod!, assessment.attempts[0].createdAt)) result.counts.found++;
          else { result.counts.missing++; result.issues.push({ code: "missing-reference", target: "periods", referenceId: assessment.academicPeriod!.term.id, message: "Сохранённый снимок периода не найден в истории справочника на указанной ревизии. Совпадающее имя не заменяет историческую связь." }); }
        }
      }
    } catch (error) {
      checkBackupAbort(signal); if (!(error instanceof Error)) throw error;
      result.counts.unavailable += linked.length;
      result.issues.push({ code: "invalid-source", target: "periods", message: "Один из источников периодов не читается, превышает предел проверки или содержит неоднозначные ключи. Другой источник не подставлялся." });
    }
  }
  checkBackupAbort(signal);
  if (!result.issues.length) result.status = "references-present";
  return result;
}
