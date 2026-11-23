import type { SubjectCatalogDocument, SubjectDefinition } from "./subjectCatalog";
import { checkBackupAbort } from "./localBackup";

type Snapshot = Pick<SubjectDefinition, "id" | "name" | "shortName"> & { revision: number };
export type SubjectSnapshotMatch = "confirmed" | "unconfirmed" | "missing-subject" | "missing-revision" | "different-values" | "later-revision";

/** Only explicit post-legacy revisions prove a saved snapshot; current names never fill history gaps. */
export async function createBackupSubjectSnapshotLookup(source: SubjectCatalogDocument, signal?: AbortSignal): Promise<(snapshot: Snapshot, occurredAt: string) => SubjectSnapshotMatch> {
  const ids = new Set<string>();
  const versions = new Map<string, { name: string; shortName: string; at: number }>();
  let count = 0;
  const step = async () => {
    if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  checkBackupAbort(signal);
  for (const subject of source.subjects) { await step(); ids.add(subject.id); }
  if (source.version === 2) {
    if (!source.legacy) throw new Error("Не определена граница старой истории дисциплин. Снимки не проверены.");
    for (let index = source.legacy.historyLength; index < source.history.length; index++) {
      await step(); const event = source.history[index], after = event.after;
      if (!after || after.revision === undefined) throw new Error("В истории дисциплин отсутствует явная ревизия снимка. Проверка прервана.");
      versions.set(JSON.stringify([after.id, after.revision]), { name: after.name, shortName: after.shortName, at: Date.parse(event.occurredAt) });
    }
  }
  checkBackupAbort(signal);
  return (snapshot, occurredAt) => {
    if (!ids.has(snapshot.id)) return "missing-subject";
    const at = Date.parse(occurredAt);
    if (snapshot.revision === 0 || source.version === 1 || !Number.isFinite(at)) return "unconfirmed";
    const version = versions.get(JSON.stringify([snapshot.id, snapshot.revision]));
    if (!version) return "missing-revision";
    if (version.at > at) return "later-revision";
    return version.name === snapshot.name && version.shortName === snapshot.shortName ? "confirmed" : "different-values";
  };
}
