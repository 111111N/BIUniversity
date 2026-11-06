import { decodeAccountsDocument } from "./accounts";
import { decodeGroupCatalog } from "./groupCatalog";
import { decodeSubjectCatalog } from "./subjectCatalog";
import { resolveJournalTeachingArea } from "./journalTeachingArea";
import { BACKUP_LIMITS, checkBackupAbort, type BackupValue } from "./localBackup";
import type { BackupRecordEntries } from "./backupRecordComparison";
import type { BackupMaterialAreaComparison, BackupMaterialAreaSource } from "./backupMaterialArea";

const KEYS = { accounts: "bi-university-accounts-v1", groups: "bi-university-group-catalog-v1", subjects: "bi-university-subject-catalog-v1" } as const;
const KNOWN_KEYS: ReadonlySet<string> = new Set(Object.values(KEYS));
const indexCatalogs = async (entries: BackupRecordEntries, signal?: AbortSignal) => {
  const documents = new Map<string, string[]>(); let bytes = 0;
  for (let i = 0; i < entries.length; i++) {
    if (i % 128 === 0) { await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); }
    const entry = entries[i]; if (!KNOWN_KEYS.has(entry.key)) continue;
    bytes += (entry.key.length + entry.raw.length) * 2;
    if (bytes > BACKUP_LIMITS.textBytes) throw new Error("Справочники областей материалов превышают лимит 16 МиБ. Частичный результат не создан.");
    const rows = documents.get(entry.key) ?? []; rows.push(entry.raw); documents.set(entry.key, rows);
  }
  const read = <T,>(key: string, decode: (raw: string) => T): T | undefined => {
    const rows = documents.get(key); if (rows?.length !== 1) return undefined;
    try { return decode(rows[0]); } catch { return undefined; }
  };
  const accounts = read(KEYS.accounts, decodeAccountsDocument), groups = read(KEYS.groups, decodeGroupCatalog), subjects = read(KEYS.subjects, decodeSubjectCatalog);
  checkBackupAbort(signal);
  return {
    accountIds: accounts ? new Set(accounts.accounts.map(row => row.id)) : undefined,
    groupIds: groups ? new Set(groups.groups.map(row => row.id)) : undefined,
    subjectIds: subjects ? new Set(subjects.subjects.map(row => row.id)) : undefined,
  };
};
interface Resolved { summary: BackupMaterialAreaSource; identity?: string }

/** Catalogs and per-scope caches belong to one inspection; no live stores or inferred accounts. */
export async function createBackupMaterialAreaComparison(archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal) {
  const catalogs = { archive: await indexCatalogs(archive, signal), browser: await indexCatalogs(browser, signal) };
  const caches = { archive: new Map<string, Resolved>(), browser: new Map<string, Resolved>() };
  const cacheBytes = { archive: 0, browser: 0 };
  const resolve = async (value: BackupValue, source: "archive" | "browser"): Promise<Resolved> => {
    checkBackupAbort(signal);
    if (value.type !== "object") return { summary: { status: "unavailable-record" } };
    const fields = new Map(value.entries);
    if (fields.size !== value.entries.length) return { summary: { status: "unavailable-record" } };
    const node = fields.get("scope");
    if (node && node.type !== "string" && node.type !== "undefined") return { summary: { status: "unavailable-record" } };
    const scope = node?.type === "string" ? node.value : undefined;
    if (scope === undefined || scope === "" || scope === "cabinet") return { summary: { status: "legacy" } };
    const cached = caches[source].get(scope); if (cached) return cached;
    const own = catalogs[source]; let result: Resolved;
    if (scope.startsWith("user:")) {
      let id: string | undefined;
      try { const decoded = decodeURIComponent(scope.slice(5)); if (decoded.trim() && `user:${encodeURIComponent(decoded)}` === scope) id = decoded; } catch { /* Noncanonical scopes never select a different person. */ }
      result = id === undefined ? { summary: { status: "unsupported-scope" } }
        : !own.accountIds ? { summary: { status: "unavailable-catalog", kind: "user" } }
        : !own.accountIds.has(id) ? { summary: { status: "unresolved-reference", kind: "user" } }
        : { summary: { status: "matched", kind: "user" }, identity: JSON.stringify(["user", id]) };
    } else if (scope.startsWith("subject:") && scope.slice(8).trim()) {
      const id = scope.slice(8);
      result = !own.subjectIds ? { summary: { status: "unavailable-catalog", kind: "subject" } }
        : !own.subjectIds.has(id) ? { summary: { status: "unresolved-reference", kind: "subject" } }
        : { summary: { status: "matched", kind: "subject" }, identity: JSON.stringify(["subject", id]) };
    } else if (scope.startsWith("group:")) {
      const area = await resolveJournalTeachingArea(scope.slice(6), own, signal);
      result = area.status === "matched" ? { summary: { status: "matched", kind: "group" }, identity: JSON.stringify(["group", area.subjectId, area.groupId]) }
        : { summary: { status: area.status === "unavailable" ? "unavailable-catalog" : area.status === "ambiguous" ? "ambiguous-area" : "unresolved-reference", kind: "group" } };
    } else result = { summary: { status: "unsupported-scope" } };
    checkBackupAbort(signal);
    cacheBytes[source] += (scope.length + (result.identity?.length ?? 0)) * 2;
    if (cacheBytes[source] > BACKUP_LIMITS.textBytes || caches[source].size >= BACKUP_LIMITS.records) throw new Error("Области материалов превышают лимиты сравнения. Частичный результат не создан.");
    caches[source].set(scope, result); return result;
  };
  return {
    async compare(a: BackupValue, b: BackupValue, unavailable: readonly ("archive" | "browser")[] = []): Promise<BackupMaterialAreaComparison> {
      checkBackupAbort(signal);
      const left: Resolved = unavailable.includes("archive") ? { summary: { status: "unavailable-record" } } : await resolve(a, "archive");
      const right: Resolved = unavailable.includes("browser") ? { summary: { status: "unavailable-record" } } : await resolve(b, "browser");
      checkBackupAbort(signal);
      return { version: 1, archive: { ...left.summary }, browser: { ...right.summary }, relation: left.identity && right.identity ? left.identity === right.identity ? "same" : "different" : "unresolved" };
    },
  };
}
