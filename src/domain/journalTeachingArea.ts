import { checkBackupAbort } from "./localBackup";

export interface ArchivedJournalCatalogs { subjectIds?: ReadonlySet<string>; groupIds?: ReadonlySet<string> }
export type JournalTeachingArea = { status: "matched"; subjectId: string; groupId: string }
  | { status: "unavailable" | "unresolved" | "ambiguous" };

/** IDs are literal: a colon can belong to either ID, so only one archived pair can resolve the key. */
export const resolveJournalTeachingArea = async (scope: string, catalogs: ArchivedJournalCatalogs, signal?: AbortSignal): Promise<JournalTeachingArea> => {
  checkBackupAbort(signal);
  if (!catalogs.subjectIds || !catalogs.groupIds) return { status: "unavailable" };
  let matched: JournalTeachingArea | undefined; let count = 0;
  // Probe subject prefixes and indexed groups instead of building the subject × group product.
  for (const subjectId of catalogs.subjectIds) {
    if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkBackupAbort(signal);
    if (!scope.startsWith(`${subjectId}:`)) continue;
    const groupId = scope.slice(subjectId.length + 1);
    if (!catalogs.groupIds.has(groupId)) continue;
    if (matched) return { status: "ambiguous" };
    matched = { status: "matched", subjectId, groupId };
  }
  checkBackupAbort(signal);
  return matched ?? { status: "unresolved" };
};
