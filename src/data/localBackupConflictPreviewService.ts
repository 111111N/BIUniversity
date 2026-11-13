import type { BackupInspection } from "./localBackupInspectionService";
import { capturePortalStorage, createBrowserBackupDependencies, type BackupCommand, type BackupDependencies } from "./localBackupService";
import { canPreviewBackupDifference, readBackupRecordPreview } from "../domain/backupRecordPreview";
import { getBackupDifferenceKey, type BackupDifference } from "../domain/backupComparison";
import { addBackupText, checkBackupAbort, createBackupBudget, type AdministrativeBackup } from "../domain/localBackup";
import { validateAdministrativeBackup } from "../domain/localBackupValidation";
import { reviewBackupAssessmentSelection, type AssessmentRecordChoice, type AssessmentSelectionCollection } from "../domain/backupAssessmentSelection";
import type { AssessmentReferenceTarget } from "../domain/backupAssessmentReferences";

export type BackupConflictVersion = "archive" | "browser";
interface Snapshot { file: File; sha256: string; actorId: string; actorRevision: number; current: AdministrativeBackup["localStorage"]; allowed: Set<string>; reviewed: Set<string>; choices: Map<string, BackupConflictVersion>; choiceRevision: number }
const snapshots = new WeakMap<BackupInspection, Snapshot>();
export const bindBackupInspectionPreview = (inspection: BackupInspection, file: File, current: AdministrativeBackup["localStorage"]) => {
  const lists: (readonly BackupDifference[] | undefined)[] = [inspection.plannerComparison?.differences, inspection.catalogComparison?.groups.differences, inspection.catalogComparison?.subjects.differences, inspection.catalogComparison?.groupHistory?.differences, inspection.catalogComparison?.subjectHistory?.differences, inspection.accountComparison?.differences, inspection.accountComparison?.history?.differences, inspection.accountComparison?.education?.differences, inspection.learningComparison?.assignments.differences, inspection.learningComparison?.submissions.differences, inspection.learningComparison?.attempts?.differences, inspection.scheduleComparison?.drafts.differences, inspection.scheduleComparison?.published.differences, inspection.scheduleComparison?.journal?.differences, inspection.journalComparison?.differences];
  lists.push(inspection.notificationComparison?.differences);
  lists.push(inspection.assessmentComparison?.assessments.differences, inspection.assessmentComparison?.history.differences);
  lists.push(inspection.assessmentComparison?.corrections?.differences, inspection.assessmentComparison?.correctionHistory?.differences);
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
      const choices: AssessmentRecordChoice[] = selectedChoices(snapshot, ASSESSMENT_COLLECTIONS), referenceChoices = selectedChoices(snapshot, REFERENCE_COLLECTIONS), choiceVersion = snapshot.choiceRevision;
      const archive = await readVerifiedArchive(dependencies, snapshot, command);
      dependencies.authorize(command);
      const result = await reviewBackupAssessmentSelection(archive.localStorage, browser, choices, command.signal, { choices: referenceChoices });
      checkBackupAbort(command.signal); dependencies.authorize(command); captureCurrent(dependencies, snapshot);
      if (snapshots.get(command.inspection) !== snapshot || snapshot.choiceRevision !== choiceVersion) throw new Error(STALE);
      return result;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось проверить выбранный набор аттестаций:", error);
      throw error;
    }
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
  reviewAssessments: (command: BackupSelectionReviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).reviewAssessments(command),
  isSelectionCurrent: (command: BackupSelectionReviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).isSelectionCurrent(command),
  preview: (command: BackupConflictPreviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).preview(command),
  isCurrent: (command: BackupConflictPreviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).isCurrent(command),
  choose: (command: BackupConflictPreviewCommand & { version: BackupConflictVersion }) => createBackupConflictPreviewService(createBrowserBackupDependencies()).choose(command),
};
