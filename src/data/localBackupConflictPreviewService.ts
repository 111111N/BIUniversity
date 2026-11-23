import type { BackupInspection } from "./localBackupInspectionService";
import { capturePortalStorage, createBrowserBackupDependencies, type BackupCommand, type BackupDependencies } from "./localBackupService";
import { canPreviewBackupDifference, readBackupRecordPreview } from "../domain/backupRecordPreview";
import { getBackupDifferenceKey, type BackupDifference } from "../domain/backupComparison";
import { addBackupText, checkBackupAbort, createBackupBudget, type AdministrativeBackup } from "../domain/localBackup";
import { validateAdministrativeBackup } from "../domain/localBackupValidation";
import { resolveBackupAssessmentSelection, reviewBackupAssessmentSelection, type AssessmentRecordChoice, type AssessmentSelectionCollection } from "../domain/backupAssessmentSelection";
import { ASSESSMENTS_STORAGE_KEY } from "../domain/assessmentTypes";
import type { AssessmentReferenceTarget } from "../domain/backupAssessmentReferences";
import { SCHEDULE_CATALOG_SECTIONS } from "../domain/backupScheduleCatalogComparison";
import { ACADEMIC_COMPARISON_SECTIONS } from "../domain/backupAcademicComparison";
import { resolveBackupPeriodSelection, type PeriodRecordChoice, type PeriodSelectionCollection } from "../domain/backupPeriodSelection";
import { resolveBackupDocumentSelection, type DocumentSelectionReview } from "../domain/backupDocumentSelection";
import { BACKUP_SELECTION_DOCUMENTS, getBackupSelectionDocumentKind } from "../domain/backupDocumentSelectionDefinitions";
import { inspectSelectedBackupDependencies } from "../domain/backupSelectedDependencies";
import type { BackupDocumentIssue } from "../domain/localBackupDocuments";
import { resolveBackupBaseSelection, type BaseRecordChoice, type BaseSelectionResult } from "../domain/backupBaseSelection";
import { BACKUP_BASE_DOCUMENTS } from "../domain/backupBaseSelectionDefinitions";
import { resolveBackupListSelection } from "../domain/backupListSelection";
import { resolveBackupVisualPreferenceSelection } from "../domain/backupVisualPreferenceSelection";
import { isBackupVisualPreferenceKey } from "../domain/backupVisualPreferences";

export type BackupConflictVersion = "archive" | "browser";
interface Snapshot { file: File; sha256: string; actorId: string; actorRevision: number; current: AdministrativeBackup["localStorage"]; allowed: Set<string>; reviewed: Set<string>; choices: Map<string, BackupConflictVersion>; choiceRevision: number }
const snapshots = new WeakMap<BackupInspection, Snapshot>();
export const bindBackupInspectionPreview = (inspection: BackupInspection, file: File, current: AdministrativeBackup["localStorage"]) => {
  const lists: (readonly BackupDifference[] | undefined)[] = [inspection.plannerComparison?.differences, inspection.catalogComparison?.groups.differences, inspection.catalogComparison?.subjects.differences, inspection.catalogComparison?.groupHistory?.differences, inspection.catalogComparison?.subjectHistory?.differences, inspection.accountComparison?.differences, inspection.accountComparison?.history?.differences, inspection.accountComparison?.education?.differences, inspection.learningComparison?.assignments.differences, inspection.learningComparison?.submissions.differences, inspection.learningComparison?.attempts?.differences, inspection.scheduleComparison?.drafts.differences, inspection.scheduleComparison?.published.differences, inspection.scheduleComparison?.journal?.differences, inspection.journalComparison?.differences];
  lists.push(inspection.notificationComparison?.differences);
  lists.push(inspection.journalSnapshotComparison?.differences);
  lists.push(inspection.accountComparison?.persons?.differences, inspection.accountComparison?.personHistory?.differences);
  lists.push(inspection.assessmentComparison?.assessments.differences, inspection.assessmentComparison?.history.differences);
  lists.push(inspection.assessmentComparison?.corrections?.differences, inspection.assessmentComparison?.correctionHistory?.differences);
  for (const section of SCHEDULE_CATALOG_SECTIONS) lists.push(inspection.scheduleCatalogComparison?.[section].differences);
  for (const section of ACADEMIC_COMPARISON_SECTIONS) lists.push(inspection.academicComparison?.[section].differences);
  snapshots.set(inspection, { file, sha256: inspection.sha256, actorId: inspection.actor.id, actorRevision: inspection.actor.revision, current: current.map(entry => ({ ...entry })), allowed: new Set([...inspection.comparison.differences, ...lists.flatMap(list => list ?? [])].filter(canPreviewBackupDifference).map(getBackupDifferenceKey)), reviewed: new Set(), choices: new Map(), choiceRevision: 0 });
};
export const releaseBackupInspectionPreview = (inspection: BackupInspection | null) => { if (inspection) snapshots.delete(inspection); };
export const clearBackupConflictChoices = (inspection: BackupInspection | null) => { const snapshot = inspection ? snapshots.get(inspection) : undefined; if (snapshot) { snapshot.reviewed.clear(); snapshot.choices.clear(); snapshot.choiceRevision++; } };
export interface BackupSelectionReviewCommand extends BackupCommand { inspection: BackupInspection }
export interface BackupConflictPreviewCommand extends BackupSelectionReviewCommand { difference: BackupDifference }
const STALE = "Архив, учётка или текущие данные изменились. Закройте сравнение и проверьте файл заново.";
const resolveBinding = (command: BackupSelectionReviewCommand) => {
  const snapshot = snapshots.get(command.inspection);
  if (!snapshot || snapshot.actorId !== command.actorId || snapshot.actorRevision !== command.actorRevision) throw new Error(STALE);
  return snapshot;
};
const resolveSnapshot = (command: BackupConflictPreviewCommand) => {
  const snapshot = resolveBinding(command);
  if (!canPreviewBackupDifference(command.difference) || !snapshot.allowed.has(getBackupDifferenceKey(command.difference))) throw new Error(STALE);
  return snapshot;
};
const captureCurrent = (dependencies: BackupDependencies, snapshot: Snapshot) => {
  const entries = capturePortalStorage(dependencies.storage), budget = createBackupBudget();
  for (const entry of entries) { addBackupText(budget, entry.key); addBackupText(budget, entry.raw); }
  if (JSON.stringify(entries) !== JSON.stringify(snapshot.current)) throw new Error(STALE);
  return entries;
};
const readVerifiedArchive = async (dependencies: BackupDependencies, snapshot: Snapshot, command: BackupSelectionReviewCommand) => {
  const bytes = await snapshot.file.arrayBuffer(); checkBackupAbort(command.signal); dependencies.authorize(command);
  if (typeof crypto === "undefined" || typeof crypto.subtle?.digest !== "function") throw new Error("Недоступна проверка отпечатка файла. Просмотр значений остановлен.");
  const digest = await crypto.subtle.digest("SHA-256", bytes); checkBackupAbort(command.signal);
  const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  if (sha256 !== snapshot.sha256) throw new Error(STALE);
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("Не удалось повторно прочитать проверенный архив. Проверьте исходный файл заново."); }
  return validateAdministrativeBackup(parsed, command.signal);
};
const ASSESSMENT_COLLECTIONS: Record<string, AssessmentSelectionCollection> = { assessments: "assessments", "assessment-history": "history", "assessment-corrections": "corrections", "assessment-correction-history": "correctionHistory" };
const REFERENCE_COLLECTIONS: Record<string, AssessmentReferenceTarget> = { accounts: "accounts", groups: "groups", subjects: "subjects" };
const PERIOD_COLLECTIONS: Record<string, PeriodSelectionCollection> = { "academic-years": "years", "academic-terms": "terms", "academic-period-history": "history" };
const selectedChoices = <Collection extends string>(snapshot: Snapshot, collections: Record<string, Collection>) => {
  const choices: { collection: Collection; id: string; version: BackupConflictVersion }[] = [];
  for (const [key, version] of snapshot.choices) {
    const reference: unknown = JSON.parse(key);
    if (!Array.isArray(reference) || reference[0] !== "localStorage-record" || !Object.hasOwn(collections, reference[3])) continue;
    if (!snapshot.allowed.has(key) || !snapshot.reviewed.has(key)) throw new Error(STALE);
    choices.push({ collection: collections[reference[3]], id: reference[4], version });
  }
  return choices;
};
const selectedBaseChoices = (snapshot: Snapshot) => {
  const grouped = new Map(BACKUP_BASE_DOCUMENTS.map(definition => [definition.key, { definition, choices: [] as BaseRecordChoice[] }]));
  for (const [key, version] of snapshot.choices) {
    const reference: unknown = JSON.parse(key);
    if (!Array.isArray(reference) || !["localStorage-record", "localStorage-journal-record"].includes(reference[0])) continue;
    const group = grouped.get(reference[2]);
    if (!group) continue;
    if (!snapshot.allowed.has(key) || !snapshot.reviewed.has(key)) throw new Error(STALE);
    group.choices.push({ key, version });
  }
  return [...grouped.values()];
};
const selectedListChoices = (snapshot: Snapshot): BaseRecordChoice[] => {
  const result: BaseRecordChoice[] = [];
  for (const [key, version] of snapshot.choices) {
    const reference: unknown = JSON.parse(key);
    if (!Array.isArray(reference) || !((reference[0] === "localStorage-record" && ["planner", "notifications", "journal-history", "journal-students", "assignments", "submissions"].includes(reference[3])) || (reference[0] === "localStorage-child-record" && reference[3] === "submission-attempts"))) continue;
    if (!snapshot.allowed.has(key) || !snapshot.reviewed.has(key)) throw new Error(STALE);
    result.push({ key, version });
  }
  return result;
};
const selectedPreferenceChoices = (snapshot: Snapshot): BaseRecordChoice[] => {
  const result: BaseRecordChoice[] = [];
  for (const [key, version] of snapshot.choices) {
    const reference: unknown = JSON.parse(key);
    if (!Array.isArray(reference) || reference[0] !== "localStorage" || !isBackupVisualPreferenceKey(reference[2])) continue;
    if (!snapshot.allowed.has(key) || !snapshot.reviewed.has(key)) throw new Error(STALE);
    result.push({ key, version });
  }
  return result;
};

export const createBackupConflictPreviewService = (dependencies: BackupDependencies) => ({
  isSelectionCurrent(command: BackupSelectionReviewCommand) {
    try {
      checkBackupAbort(command.signal); dependencies.authorize(command);
      const snapshot = resolveBinding(command); captureCurrent(dependencies, snapshot); dependencies.authorize(command);
      return snapshots.get(command.inspection) === snapshot;
    } catch { return false; }
  },
  async reviewAssessments(command: BackupSelectionReviewCommand) {
    try {
      checkBackupAbort(command.signal); dependencies.authorize(command);
      const snapshot = resolveBinding(command), browser = captureCurrent(dependencies, snapshot);
      const choices: AssessmentRecordChoice[] = selectedChoices(snapshot, ASSESSMENT_COLLECTIONS), referenceChoices = selectedChoices(snapshot, REFERENCE_COLLECTIONS), periodChoices = selectedChoices(snapshot, PERIOD_COLLECTIONS), choiceVersion = snapshot.choiceRevision;
      const baseChoices = selectedBaseChoices(snapshot).filter(group => group.definition.kind !== "schedule").flatMap(group => group.choices);
      const archive = await readVerifiedArchive(dependencies, snapshot, command);
      dependencies.authorize(command);
      const result = await reviewBackupAssessmentSelection(archive.localStorage, browser, choices, command.signal, { choices: referenceChoices, periodChoices, baseChoices });
      checkBackupAbort(command.signal); dependencies.authorize(command); captureCurrent(dependencies, snapshot);
      if (snapshots.get(command.inspection) !== snapshot || snapshot.choiceRevision !== choiceVersion) throw new Error(STALE);
      return result;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось проверить выбранный набор аттестаций:", error);
      throw error;
    }
  },
  async reviewPeriods(command: BackupSelectionReviewCommand) {
    try {
      checkBackupAbort(command.signal); dependencies.authorize(command);
      const snapshot = resolveBinding(command), browser = captureCurrent(dependencies, snapshot), choiceVersion = snapshot.choiceRevision;
      const choices: PeriodRecordChoice[] = selectedChoices(snapshot, PERIOD_COLLECTIONS), archive = await readVerifiedArchive(dependencies, snapshot, command);
      dependencies.authorize(command);
      const result = await resolveBackupPeriodSelection(archive.localStorage, browser, choices, command.signal);
      checkBackupAbort(command.signal); dependencies.authorize(command); captureCurrent(dependencies, snapshot);
      if (snapshots.get(command.inspection) !== snapshot || snapshot.choiceRevision !== choiceVersion) throw new Error(STALE);
      return result.review;
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось проверить выбранные учебные периоды:", error); throw error; }
  },
  async reviewDocuments(command: BackupSelectionReviewCommand) {
    try {
      checkBackupAbort(command.signal); dependencies.authorize(command);
      const snapshot = resolveBinding(command), browser = captureCurrent(dependencies, snapshot), choiceVersion = snapshot.choiceRevision;
      const choices = BACKUP_SELECTION_DOCUMENTS.map(definition => selectedChoices(snapshot, Object.fromEntries(definition.collections.map(collection => [collection.recordCollection, collection.recordCollection]))));
      const baseChoices = selectedBaseChoices(snapshot);
      const periodChoices = selectedChoices(snapshot, PERIOD_COLLECTIONS);
      const assessmentChoices = selectedChoices(snapshot, ASSESSMENT_COLLECTIONS);
      const listChoices = selectedListChoices(snapshot);
      const preferenceChoices = selectedPreferenceChoices(snapshot);
      const archive = await readVerifiedArchive(dependencies, snapshot, command), documents: DocumentSelectionReview[] = [], selected = new Map<string, object>(), unavailable: BackupDocumentIssue[] = [];
      const baseDocuments = new Map<string, BaseSelectionResult>();
      for (const { definition, choices } of baseChoices) {
        checkBackupAbort(command.signal); dependencies.authorize(command);
        const result = await resolveBackupBaseSelection(archive.localStorage, browser, choices, definition, command.signal);
        baseDocuments.set(definition.key, result);
        if (result.review.status === "blocked") unavailable.push({ kind: definition.kind, level: "review", code: "selected-base-source-unavailable", referenceId: definition.key, message: "Полный базовый источник не подтверждён выбранными записями и служебными сведениями. Его данные не подставлялись при проверке зависимостей." });
      }
      for (const [index, definition] of BACKUP_SELECTION_DOCUMENTS.entries()) {
        checkBackupAbort(command.signal); dependencies.authorize(command);
        const result = await resolveBackupDocumentSelection(archive.localStorage, browser, choices[index], definition, command.signal);
        documents.push(result.review);
        if (result.document) selected.set(definition.key, result.document);
        if (result.review.status === "blocked") {
          const kind = getBackupSelectionDocumentKind(definition.key);
          if (!kind) throw new Error("Вид выбранного документа не поддерживается проверкой зависимостей.");
          unavailable.push({ kind, level: "review", code: "selected-document-structure-unavailable", referenceId: definition.key, message: "Выбранный документ не согласован со своей историей. Его значения не подставлялись при проверке зависимостей." });
        }
      }
      const assessmentSelection = await resolveBackupAssessmentSelection(archive.localStorage, browser, assessmentChoices, command.signal);
      const listSelection = await resolveBackupListSelection(archive.localStorage, browser, listChoices, command.signal);
      unavailable.push(...listSelection.issues);
      const preferenceSelection = await resolveBackupVisualPreferenceSelection(archive.localStorage, browser, preferenceChoices, command.signal);
      unavailable.push(...preferenceSelection.issues);
      const assessmentSource = assessmentSelection.review;
      const assessmentAbsent = assessmentSource.issues.some(issue => issue.code === "missing-source");
      if (assessmentSelection.document) selected.set(ASSESSMENTS_STORAGE_KEY, assessmentSelection.document);
      else if (!assessmentAbsent) for (const finding of assessmentSource.issues) unavailable.push({ kind: "assessments", level: "review", code: `selected-assessment-${finding.code}`, message: finding.message });
      const periodSelection = await resolveBackupPeriodSelection(archive.localStorage, browser, periodChoices, command.signal);
      if (!periodSelection.document && periodSelection.review.issues.some(issue => issue.code !== "missing-source")) unavailable.push({ kind: "periods", level: "review", code: "selected-period-structure-unavailable", message: "Выбранный справочник периодов не согласован. Его снимки не подставлялись при проверке других документов." });
      dependencies.authorize(command);
      const references = await inspectSelectedBackupDependencies(archive.localStorage, browser, selected, periodSelection.document, new Date().toISOString(), command.signal, unavailable, baseDocuments, listSelection.sources, preferenceSelection.entries);
      checkBackupAbort(command.signal); dependencies.authorize(command); captureCurrent(dependencies, snapshot);
      if (snapshots.get(command.inspection) !== snapshot || snapshot.choiceRevision !== choiceVersion) throw new Error(STALE);
      const baseSources = [...baseDocuments.values()].map(result => result.review);
      const listSources = listSelection.reviews;
      const preferenceSources = preferenceSelection.reviews;
      const absent = documents.every(document => document.status === "absent") && baseSources.every(source => source.status === "absent") && assessmentAbsent && listSources.every(source => source.status === "absent") && preferenceSources.every(source => source.status === "absent");
      const blocked = documents.some(document => document.status === "blocked") || baseSources.some(source => source.status === "blocked") || listSources.some(source => source.status === "blocked") || preferenceSources.some(source => source.status === "blocked") || (assessmentSource.status === "blocked" && !assessmentAbsent);
      return { scope: "selected-document-structures" as const, status: absent ? "absent" as const : blocked ? "blocked" as const : "consistent" as const, documents, baseSources, assessmentSource, listSources, preferenceSources, references };
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось проверить выбранные справочники и их историю:", error); throw error; }
  },
  choose(command: BackupConflictPreviewCommand & { version: BackupConflictVersion }) {
    try {
      checkBackupAbort(command.signal); dependencies.authorize(command);
      const snapshot = resolveSnapshot(command), key = getBackupDifferenceKey(command.difference);
      if (!["archive", "browser"].includes(command.version) || !snapshot.reviewed.has(key)) throw new Error("Сначала просмотрите обе поддерживаемые версии записи. Выбор не сохранён.");
      captureCurrent(dependencies, snapshot); dependencies.authorize(command); captureCurrent(dependencies, snapshot);
      snapshot.choices.set(key, command.version);
      snapshot.choiceRevision++;
      return new Map(snapshot.choices);
    } catch (error) {
      console.error("Не удалось сохранить черновик выбора версии:", error); throw error;
    }
  },
  isCurrent(command: BackupConflictPreviewCommand) {
    try {
      checkBackupAbort(command.signal); dependencies.authorize(command);
      const snapshot = resolveSnapshot(command); captureCurrent(dependencies, snapshot); dependencies.authorize(command);
      return snapshots.get(command.inspection) === snapshot;
    } catch { return false; }
  },
  async preview(command: BackupConflictPreviewCommand) {
    try {
      checkBackupAbort(command.signal); dependencies.authorize(command);
      const snapshot = resolveSnapshot(command);
      const browser = captureCurrent(dependencies, snapshot); command.onProgress?.("Читаем проверенные версии…");
      const archive = await readVerifiedArchive(dependencies, snapshot, command);
      dependencies.authorize(command);
      const result = await readBackupRecordPreview(archive.localStorage, browser, command.difference, command.signal);
      checkBackupAbort(command.signal); dependencies.authorize(command); captureCurrent(dependencies, snapshot);
      if (snapshots.get(command.inspection) !== snapshot) throw new Error(STALE);
      if (!result.hasUnpreviewedFields && result.rows.length > 0) snapshot.reviewed.add(getBackupDifferenceKey(command.difference));
      return result;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось открыть сравнение версий резервной копии:", error);
      throw error;
    }
  },
});
export const backupConflictPreviewService = {
  reviewDocuments: (command: BackupSelectionReviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).reviewDocuments(command),
  reviewPeriods: (command: BackupSelectionReviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).reviewPeriods(command),
  reviewAssessments: (command: BackupSelectionReviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).reviewAssessments(command),
  isSelectionCurrent: (command: BackupSelectionReviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).isSelectionCurrent(command),
  preview: (command: BackupConflictPreviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).preview(command),
  isCurrent: (command: BackupConflictPreviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).isCurrent(command),
  choose: (command: BackupConflictPreviewCommand & { version: BackupConflictVersion }) => createBackupConflictPreviewService(createBrowserBackupDependencies()).choose(command),
};
