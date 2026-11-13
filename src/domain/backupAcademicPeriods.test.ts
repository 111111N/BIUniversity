import { describe, expect, it } from "vitest";
import { ACADEMIC_PERIODS_STORAGE_KEY, emptyAcademicPeriodsDocument, executeAcademicPeriodCommand } from "./academicPeriods";
import { BACKUP_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";
import { assessBackupRestoreAdmission } from "./backupRestoreAdmission";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";

const fixture = () => {
  const core = coreBackupFixture(), actor = core.accounts.accounts[0];
  const state = executeAcademicPeriodCommand(emptyAcademicPeriodsDocument(), { type: "create-year", actorId: actor.id, actorRevision: actor.revision, expectedRevision: 0, draft: { name: "2026–2027", startsOn: "2026-09-01", endsOn: "2027-08-31" } }, actor,
    { entityId: "year-2026", eventId: "created", occurredAt: "2026-10-28T09:00:00.000Z" });
  const entry = { key: ACADEMIC_PERIODS_STORAGE_KEY, raw: JSON.stringify(state) }; core.archive.localStorage.push(entry);
  return { ...core, state, entry };
};
describe("archived shared academic calendar", () => {
  it("registers the schema and checks historical author presence without assuming authority", async () => {
    const { archive } = fixture(), review = await inspectBackupDocuments(archive, "configurator-demo");
    expect(BACKUP_DOCUMENTS.periods.key).toBe(ACADEMIC_PERIODS_STORAGE_KEY);
    expect(review.checks.find(row => row.kind === "periods")).toMatchObject({ status: "valid", revision: 1, records: 1 });
    expect(review.uncheckedKeys).not.toContain(ACADEMIC_PERIODS_STORAGE_KEY); expect(review.issues.filter(row => row.kind === "periods")).toEqual([expect.objectContaining({ code: "unconfirmed-period-authority", level: "review" })]);
    expect(assessBackupRestoreAdmission(review).blockers).toContainEqual(expect.objectContaining({ code: "unconfirmed-period-authority" }));
  });
  it("keeps absence distinct from an empty validated calendar", async () => {
    const { archive, entry } = fixture(); entry.raw = JSON.stringify(emptyAcademicPeriodsDocument());
    expect((await inspectBackupDocuments(archive, "configurator-demo")).checks.find(row => row.kind === "periods")).toMatchObject({ status: "valid", records: 0 });
    archive.localStorage = archive.localStorage.filter(row => row !== entry);
    expect((await inspectBackupDocuments(archive, "configurator-demo")).checks.find(row => row.kind === "periods")).toMatchObject({ status: "absent" });
  });
  it.each(["damaged", "unsupported-version", "future-key", "missing-author", "missing-accounts", "future-event"])("reports %s without using live stores", async mode => {
    const { archive, state, entry } = fixture();
    if (mode === "damaged") entry.raw = "broken";
    if (mode === "unsupported-version") entry.raw = JSON.stringify({ ...state, version: 99 });
    if (mode === "future-key") entry.key = "bi-university-academic-periods-v2";
    if (mode === "missing-author") { state.history[0].actorId = "missing"; entry.raw = JSON.stringify(state); }
    if (mode === "missing-accounts") archive.localStorage = archive.localStorage.filter(row => row.key !== BACKUP_DOCUMENTS.accounts.key);
    if (mode === "future-event") { state.history[0].occurredAt = "2026-11-13T09:00:00.000Z"; entry.raw = JSON.stringify(state); }
    const result = await inspectBackupDocuments(archive, "configurator-demo"), code = { damaged: "invalid-document", "unsupported-version": "invalid-document", "future-key": "unsupported-key", "missing-author": "missing-period-author", "missing-accounts": "unchecked-period-author", "future-event": "period-event-after-backup" }[mode];
    expect(result.issues).toContainEqual(expect.objectContaining({ kind: "periods", code }));
    expect(assessBackupRestoreAdmission(result).status).toBe("blocked");
  });
});
