import { BACKUP_DATABASES, type AdministrativeBackup, type RawBackupDatabase } from "../domain/localBackup";

export const backupTime = "2026-10-28T10:00:00.000Z";
export const backupFixture = (): AdministrativeBackup => ({
  format: "bi-university-local-backup", version: 1, scope: "administrative", startedAt: backupTime, completedAt: backupTime,
  actor: { id: "configurator-demo", revision: 1 }, source: { origin: "https://portal.example", basePath: "/BIUniversity/" }, consistency: "per-database-readonly-transaction",
  exclusions: ["sessionStorage"], localStorage: [], totals: { storageEntries: 0, databaseRecords: 0, files: 0, binaryBytes: 0 },
  databases: BACKUP_DATABASES.map(({ name }) => ({ name, version: null, capturedAt: backupTime, stores: [] })),
});
export const rawBackupDatabase = (name: string, store: string): RawBackupDatabase => ({
  name, version: 1, capturedAt: backupTime, stores: [{ name: store, keyPath: null, autoIncrement: false, indexes: [], records: [] }],
});
