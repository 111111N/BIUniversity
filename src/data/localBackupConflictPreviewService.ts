import type { BackupInspection } from "./localBackupInspectionService";
import { capturePortalStorage, createBrowserBackupDependencies, type BackupCommand, type BackupDependencies } from "./localBackupService";
import { canPreviewBackupDifference, readBackupRecordPreview } from "../domain/backupRecordPreview";
import { getBackupDifferenceKey, type BackupDifference } from "../domain/backupComparison";
import { addBackupText, checkBackupAbort, createBackupBudget, type AdministrativeBackup } from "../domain/localBackup";
import { validateAdministrativeBackup } from "../domain/localBackupValidation";

export type BackupConflictVersion = "archive" | "browser";
interface Snapshot { file: File; sha256: string; actorId: string; actorRevision: number; current: AdministrativeBackup["localStorage"]; allowed: Set<string>; reviewed: Set<string>; choices: Map<string, BackupConflictVersion> }
const snapshots = new WeakMap<BackupInspection, Snapshot>();
export const bindBackupInspectionPreview = (inspection: BackupInspection, file: File, current: AdministrativeBackup["localStorage"]) => {
  const lists: (readonly BackupDifference[] | undefined)[] = [inspection.plannerComparison?.differences, inspection.catalogComparison?.groups.differences, inspection.catalogComparison?.subjects.differences, inspection.catalogComparison?.groupHistory?.differences, inspection.catalogComparison?.subjectHistory?.differences, inspection.accountComparison?.differences, inspection.accountComparison?.history?.differences, inspection.accountComparison?.education?.differences, inspection.learningComparison?.assignments.differences, inspection.learningComparison?.submissions.differences, inspection.learningComparison?.attempts?.differences, inspection.scheduleComparison?.drafts.differences, inspection.scheduleComparison?.published.differences, inspection.scheduleComparison?.journal?.differences, inspection.journalComparison?.differences];
  lists.push(inspection.notificationComparison?.differences);
  lists.push(inspection.assessmentComparison?.assessments.differences, inspection.assessmentComparison?.history.differences);
  lists.push(inspection.assessmentComparison?.corrections?.differences, inspection.assessmentComparison?.correctionHistory?.differences);
  snapshots.set(inspection, { file, sha256: inspection.sha256, actorId: inspection.actor.id, actorRevision: inspection.actor.revision, current: current.map(entry => ({ ...entry })), allowed: new Set([...inspection.comparison.differences, ...lists.flatMap(list => list ?? [])].filter(canPreviewBackupDifference).map(getBackupDifferenceKey)), reviewed: new Set(), choices: new Map() });
};
export const releaseBackupInspectionPreview = (inspection: BackupInspection | null) => { if (inspection) snapshots.delete(inspection); };
export const clearBackupConflictChoices = (inspection: BackupInspection | null) => { const snapshot = inspection ? snapshots.get(inspection) : undefined; snapshot?.reviewed.clear(); snapshot?.choices.clear(); };
export interface BackupConflictPreviewCommand extends BackupCommand { inspection: BackupInspection; difference: BackupDifference }
const STALE = "Архив, учётка или текущие данные изменились. Закройте сравнение и проверьте файл заново.";
const resolveSnapshot = (command: BackupConflictPreviewCommand) => {
  const snapshot = snapshots.get(command.inspection);
  if (!snapshot || snapshot.actorId !== command.actorId || snapshot.actorRevision !== command.actorRevision || !canPreviewBackupDifference(command.difference) || !snapshot.allowed.has(getBackupDifferenceKey(command.difference))) throw new Error(STALE);
  return snapshot;
};
const captureCurrent = (dependencies: BackupDependencies, snapshot: Snapshot) => {
  const entries = capturePortalStorage(dependencies.storage), budget = createBackupBudget();
  for (const entry of entries) { addBackupText(budget, entry.key); addBackupText(budget, entry.raw); }
  if (JSON.stringify(entries) !== JSON.stringify(snapshot.current)) throw new Error(STALE);
  return entries;
};

export const createBackupConflictPreviewService = (dependencies: BackupDependencies) => ({
  choose(command: BackupConflictPreviewCommand & { version: BackupConflictVersion }) {
    try {
      checkBackupAbort(command.signal); dependencies.authorize(command);
      const snapshot = resolveSnapshot(command), key = getBackupDifferenceKey(command.difference);
      if (!["archive", "browser"].includes(command.version) || !snapshot.reviewed.has(key)) throw new Error("Сначала просмотрите обе поддерживаемые версии записи. Выбор не сохранён.");
      captureCurrent(dependencies, snapshot); dependencies.authorize(command); captureCurrent(dependencies, snapshot);
      snapshot.choices.set(key, command.version);
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
      const bytes = await snapshot.file.arrayBuffer(); checkBackupAbort(command.signal); dependencies.authorize(command);
      if (typeof crypto === "undefined" || typeof crypto.subtle?.digest !== "function") throw new Error("Недоступна проверка отпечатка файла. Просмотр значений остановлен.");
      const digest = await crypto.subtle.digest("SHA-256", bytes); checkBackupAbort(command.signal);
      const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
      if (sha256 !== snapshot.sha256) throw new Error(STALE);
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { throw new Error("Не удалось повторно прочитать проверенный архив. Проверьте исходный файл заново."); }
      const archive = await validateAdministrativeBackup(parsed, command.signal);
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
  preview: (command: BackupConflictPreviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).preview(command),
  isCurrent: (command: BackupConflictPreviewCommand) => createBackupConflictPreviewService(createBrowserBackupDependencies()).isCurrent(command),
  choose: (command: BackupConflictPreviewCommand & { version: BackupConflictVersion }) => createBackupConflictPreviewService(createBrowserBackupDependencies()).choose(command),
};
