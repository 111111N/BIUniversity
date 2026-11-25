import type { SubjectCatalogDocument, SubjectDefinition } from "./subjectCatalog";
import { checkBackupAbort } from "./localBackup";
import { createBackupInspectionWork } from "./backupIssueCollector";

type Snapshot = Pick<SubjectDefinition, "id" | "name" | "shortName"> & { revision: number };
export type SubjectSnapshotMatch = "confirmed" | "unconfirmed" | "missing-subject" | "missing-revision" | "different-values" | "later-revision";

/** Only explicit post-legacy revisions prove a saved snapshot; current names never fill history gaps. */
async function buildSubjectSnapshotLookup(source: SubjectCatalogDocument, signal?: AbortSignal): Promise<(snapshot: Snapshot, occurredAt: string) => SubjectSnapshotMatch> {
  const ids = new Set<string>();
  const versions = new Map<string, { name: string; shortName: string; at: number }>();
  const work = createBackupInspectionWork("снимков дисциплин учебных планов", signal), step = work.step;
  await step(0); work.assertRecords(source.subjects.length); work.assertRecords(source.history.length);
  for (const subject of source.subjects) { await step(); work.addText(subject.id); ids.add(subject.id); }
  if (source.version === 2) {
    if (!source.legacy) throw new Error("Не определена граница старой истории дисциплин. Снимки не проверены.");
    for (let index = source.legacy.historyLength; index < source.history.length; index++) {
      await step(); const event = source.history[index], after = event.after;
      if (!after || after.revision === undefined) throw new Error("В истории дисциплин отсутствует явная ревизия снимка. Проверка прервана.");
      work.addText(JSON.stringify([after.id, after.revision, after.name, after.shortName]));
      versions.set(JSON.stringify([after.id, after.revision]), { name: after.name, shortName: after.shortName, at: Date.parse(event.occurredAt) });
    }
  }
  checkBackupAbort(signal);
  return (snapshot, occurredAt) => {
    work.check();
    if (!ids.has(snapshot.id)) return "missing-subject";
    const at = Date.parse(occurredAt);
    if (snapshot.revision === 0 || source.version === 1 || !Number.isFinite(at)) return "unconfirmed";
    const version = versions.get(JSON.stringify([snapshot.id, snapshot.revision]));
    if (!version) return "missing-revision";
    if (version.at > at) return "later-revision";
    return version.name === snapshot.name && version.shortName === snapshot.shortName ? "confirmed" : "different-values";
  };
}

export async function createBackupSubjectSnapshotLookup(...args: Parameters<typeof buildSubjectSnapshotLookup>) {
  try { return await buildSubjectSnapshotLookup(...args); }
  catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось подготовить исторические снимки дисциплин учебных планов:", error);
    throw error;
  }
}
