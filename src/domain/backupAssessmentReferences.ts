import type { AssessmentDocument } from "./assessmentTypes";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";
import type { BackupRecordEntries } from "./backupRecordComparison";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import { resolveBackupPeriodSelection, type PeriodRecordChoice } from "./backupPeriodSelection";
import { resolveBackupBaseSelection, type BaseRecordChoice, type BaseSelectionReview } from "./backupBaseSelection";
import { BACKUP_BASE_DOCUMENTS } from "./backupBaseSelectionDefinitions";
import { getBackupDifferenceKey } from "./backupComparison";

export type AssessmentReferenceTarget = "accounts" | "groups" | "subjects";
export interface AssessmentReferenceChoice { collection: AssessmentReferenceTarget; id: string; version: "archive" | "browser" }
export interface AssessmentReferenceIssue {
  code: "invalid-source" | "missing-source" | "missing-reference" | "unresolved-reference" | "invalid-choice";
  target?: AssessmentReferenceTarget | "periods"; referenceId?: string; message: string;
}
export interface AssessmentReferenceReview {
  scope: "assessment-reference-presence"; status: "references-present" | "blocked";
  counts: { references: number; found: number; missing: number; unresolved: number; unavailable: number };
  issues: AssessmentReferenceIssue[]; baseSources?: BaseSelectionReview[];
}
export const ASSESSMENT_REFERENCE_LABELS: Record<AssessmentReferenceTarget | "periods", string> = { accounts: "Учётная запись", groups: "Группа", subjects: "Дисциплина", periods: "Учебный период" };
const TARGETS: readonly AssessmentReferenceTarget[] = ["accounts", "groups", "subjects"];
const DEFINITIONS = BACKUP_BASE_DOCUMENTS.filter(definition => (TARGETS as readonly string[]).includes(definition.kind));

/** Full saved sources must agree with the choice. Presence never proves historical roles. */
export async function inspectSelectedAssessmentReferences(
  document: AssessmentDocument, archive: BackupRecordEntries, browser: BackupRecordEntries,
  choices: readonly AssessmentReferenceChoice[], signal?: AbortSignal, periodChoices: readonly PeriodRecordChoice[] = [], baseChoices?: readonly BaseRecordChoice[],
): Promise<AssessmentReferenceReview> {
  checkBackupAbort(signal);
  const result: AssessmentReferenceReview = { scope: "assessment-reference-presence", status: "blocked", counts: { references: 0, found: 0, missing: 0, unresolved: 0, unavailable: 0 }, issues: [], baseSources: [] };
  const refs: Record<AssessmentReferenceTarget, Set<string>> = { accounts: new Set(), groups: new Set(), subjects: new Set() };
  const issueBudget = createBackupBudget();
  const issue = (value: AssessmentReferenceIssue) => {
    if (result.issues.length >= BACKUP_LIMITS.records) throw new Error("Замечаний к ссылкам аттестаций больше 25 000. Частичный результат не создан.");
    addBackupText(issueBudget, JSON.stringify(value)); result.issues.push(value);
  };
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
  const grouped = new Map(DEFINITIONS.map(definition => [definition.key, [] as BaseRecordChoice[]]));
  const legacy: BaseRecordChoice[] = [], legacySeen = new Set<string>();
  if (!Array.isArray(choices) || choices.length > BACKUP_LIMITS.records) { issue({ code: "invalid-choice", message: "Выбор справочников некорректен или превышает предел проверки." }); return result; }
  for (const choice of choices) {
    await step();
    if (!choice || !TARGETS.includes(choice.collection) || typeof choice.id !== "string" || !choice.id || !["archive", "browser"].includes(choice.version)) { issue({ code: "invalid-choice", message: "Выбор справочников содержит неподдерживаемую запись или версию." }); return result; }
    const definition = DEFINITIONS.find(value => value.kind === choice.collection)!;
    const key = getBackupDifferenceKey({ kind: "different", area: "", id: choice.id, reference: { storage: "localStorage-record", key: definition.key, collection: choice.collection, id: choice.id } });
    if (legacySeen.has(key)) { issue({ code: "invalid-choice", message: "Выбор карточек справочника повторяется. Проверьте файл заново." }); return result; }
    legacySeen.add(key); legacy.push({ key, version: choice.version });
  }
  const fullChoices = baseChoices ?? legacy, seen = new Set<string>(), choiceBudget = createBackupBudget();
  const fullCards = new Map<string, BaseRecordChoice["version"]>();
  if (!Array.isArray(fullChoices) || fullChoices.length > BACKUP_LIMITS.records) { issue({ code: "invalid-choice", message: "Выбор полных базовых источников превышает предел проверки." }); return result; }
  for (const choice of fullChoices) {
    await step();
    let address: unknown;
    try { address = JSON.parse(choice?.key); } catch { address = null; }
    if (!choice || typeof choice.key !== "string" || !["archive", "browser"].includes(choice.version) || seen.has(choice.key) || !Array.isArray(address) || address[0] !== "localStorage-record" || address[1] !== "different" || !grouped.has(address[2])) { issue({ code: "invalid-choice", message: "Выбор базовых источников устарел или содержит неоднозначный адрес. Проверьте файл заново." }); return result; }
    addBackupText(choiceBudget, choice.key); seen.add(choice.key); grouped.get(address[2])!.push(choice);
    if ((TARGETS as readonly string[]).includes(address[3])) fullCards.set(choice.key, choice.version);
  }
  if (baseChoices && (fullCards.size !== legacy.length || legacy.some(choice => fullCards.get(choice.key) !== choice.version))) { issue({ code: "invalid-choice", message: "Выбор карточек и полного базового источника различается. Проверьте файл и выбор заново." }); return result; }
  for (const target of TARGETS) {
    const ids = refs[target]; if (!ids.size) continue;
    const definition = DEFINITIONS.find(value => value.kind === target)!;
    const source = await resolveBackupBaseSelection(archive, browser, grouped.get(definition.key)!, definition, signal);
    result.baseSources!.push(source.review);
    if (source.review.status !== "matched" || !source.document) {
      const invalid = source.review.issues.some(value => value.code === "invalid-source"), absent = source.review.status === "absent";
      if (invalid || absent) result.counts.unavailable += ids.size; else result.counts.unresolved += ids.size;
      issue({ code: absent ? "missing-source" : invalid ? "invalid-source" : "unresolved-reference", target, message: "Полный базовый источник не подтверждён. Ссылки не засчитаны по отдельным карточкам; причины показаны в проверке источника." });
      continue;
    }
    const rows = definition.collections.find(value => value.collection === target)!.read(source.document);
    const available = new Set<string>();
    for (const row of rows) { await step(); available.add((row as { id: string }).id); }
    for (const id of ids) {
      await step();
      if (available.has(id)) result.counts.found++;
      else { result.counts.missing++; issue({ code: "missing-reference", target, referenceId: id, message: "ID участника, автора или учебного справочника отсутствует в выбранном полном источнике. Сопоставление по имени не выполнялось." }); }
    }
  }
  const linked = document.assessments.filter(row => row.academicPeriod);
  if (linked.length) {
    result.counts.references += linked.length;
    const selected = await resolveBackupPeriodSelection(archive, browser, periodChoices, signal);
    if (!selected.document) {
      const unavailable = selected.review.issues.some(value => value.code === "invalid-source" || value.code === "missing-source");
      if (unavailable) result.counts.unavailable += linked.length; else result.counts.unresolved += linked.length;
      for (const value of selected.review.issues) issue({ code: value.code === "invalid-source" || value.code === "missing-source" ? value.code : "unresolved-reference", target: "periods", message: value.message });
    } else {
      const periodExists = createAssessmentPeriodHistoryLookup(selected.document);
      for (const assessment of linked) {
        await step();
        if (periodExists(assessment.academicPeriod!, assessment.attempts[0].createdAt)) result.counts.found++;
        else { result.counts.missing++; issue({ code: "missing-reference", target: "periods", referenceId: assessment.academicPeriod!.term.id, message: "Сохранённый снимок периода не найден в истории справочника на указанной ревизии. Совпадающее имя не заменяет историческую связь." }); }
      }
    }
  }
  checkBackupAbort(signal);
  if (!result.issues.length) result.status = "references-present";
  return result;
}
