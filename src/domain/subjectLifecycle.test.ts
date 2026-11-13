import { describe, expect, it } from "vitest";
import { changeSubjectStatus, createSubject, decodeSubjectCatalog, subjectArchiveBlockers, updateSubject, type SubjectCatalogDocument, type SubjectDependencies } from "./subjectCatalog";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";
import { assessmentSupervisorFixture } from "../testSupport/assessmentSupervisors";
import { getSubjectDependencies } from "./subjectDependencies";
import { assessmentCorrectionFixture } from "../testSupport/assessmentCorrections";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { compareBackupCatalogRecords } from "./backupCatalogComparison";
import { readBackupRecordPreview } from "./backupRecordPreview";

const fixture = () => {
  const core = coreBackupFixture(), actor = core.accounts.accounts[0], state = core.subjects;
  const command = { actorId: actor.id, actorRevision: actor.revision, expectedRevision: state.revision, subjectId: "subject-1", subjectRevision: 0 };
  const update = (value = state, name = "Новая математика") => updateSubject(value, { ...command, expectedRevision: value.revision, subjectRevision: value.subjects[0].revision ?? 0, draft: { name, shortName: "НМ" } }, actor, `edit-${value.revision}`, "2026-11-13T09:00:00Z");
  return { core, state, actor, command, update };
};
const empty: SubjectDependencies = { teachingAssignments: 0, draftLessons: 0, futurePublishedLessons: 0, unfinishedAssessments: 0 };
describe("subject lifecycle and compatible audit", () => {
  it("preserves legacy values and starts explicit snapshots without inventing early history", () => {
    const { state, update } = fixture(), before = JSON.stringify(state), next = update();
    expect(JSON.stringify(state)).toBe(before); expect(next).toMatchObject({ version: 2, revision: 2, legacy: { revision: 1, historyLength: 0 }, subjects: [{ id: "subject-1", name: "Новая математика", previousNames: ["Математика"], revision: 1, status: "active" }], history: [{ action: "updated", origin: "saved-snapshot", before: state.subjects[0] }] });
    expect(decodeSubjectCatalog(JSON.stringify(next))).toEqual(next);
  });
  it("keeps legacy creation events unchanged and appends tracked changes", () => {
    const { state, actor, command } = fixture();
    state.history.push({ id: "legacy", subjectId: "subject-1", actorId: actor.id, occurredAt: "2026-10-28T10:00:00Z", action: "created" });
    const next = updateSubject(state, { ...command, draft: { name: "Новое название", shortName: "НН" } }, actor, "update", "2026-11-13T09:00:00Z");
    expect(next.history[0]).toEqual(state.history[0]); expect(next.legacy).toEqual({ revision: 1, historyLength: 1 });
  });
  it("reserves old names, allows returning to one's own name, and retains opaque legacy fields", () => {
    const f = fixture(); Object.assign(f.state.subjects[0], { customMetadata: { preserved: true } });
    const renamed = f.update(), restored = f.update(renamed, "Математика");
    expect(restored.subjects[0]).toMatchObject({ name: "Математика", previousNames: ["Новая математика"], customMetadata: { preserved: true } });
    expect(() => createSubject(renamed, { actorId: f.actor.id, actorRevision: 1, expectedRevision: renamed.revision, draft: { name: "МАТЕМАТИКА", shortName: "М2" } }, f.actor, "other", "create", "2026-11-13T09:00:00Z")).toThrow("истории");
  });
  it("archives and restores without deleting the subject or its audit", () => {
    const f = fixture(), status = { ...f.command, status: "archived" as const, expectedAccountsRevision: 1, expectedScheduleRevision: 1, expectedAssessmentRevision: 0 };
    const archived = changeSubjectStatus(f.state, status, f.actor, empty, "archive", "2026-11-13T09:00:00Z");
    expect(archived.subjects[0]).toMatchObject({ id: "subject-1", status: "archived", revision: 1 });
    expect(() => f.update(archived)).toThrow("восстановите");
    const restored = changeSubjectStatus(archived, { ...status, expectedRevision: archived.revision, subjectRevision: 1, status: "active" }, f.actor, empty, "restore", "2026-11-13T09:00:00Z");
    expect(restored.subjects[0]).toMatchObject({ id: "subject-1", status: "active", revision: 2 }); expect(restored.history.map(row => row.action)).toEqual(["archived", "restored"]);
  });
  it.each(Object.keys(empty) as (keyof SubjectDependencies)[])("blocks archive for %s", field => {
    const f = fixture(), dependencies = { ...empty, [field]: 1 };
    expect(subjectArchiveBlockers(dependencies)).toHaveLength(1);
    expect(() => changeSubjectStatus(f.state, { ...f.command, status: "archived", expectedAccountsRevision: 1, expectedScheduleRevision: 1, expectedAssessmentRevision: 0 }, f.actor, dependencies, "archive", "2026-11-13T09:00:00Z")).toThrow(subjectArchiveBlockers(dependencies)[0]);
  });
  it.each(["actor", "role", "blocked", "revision", "subject-revision", "missing"])("rejects stale or unauthorized editing: %s", mode => {
    const f = fixture(), actor = { ...f.actor }, command = { ...f.command, draft: { name: "Другой предмет", shortName: "ДП" } };
    if (mode === "actor") actor.id = "another";
    if (mode === "role") actor.role = "teacher";
    if (mode === "blocked") actor.status = "blocked";
    if (mode === "revision") command.expectedRevision++;
    if (mode === "subject-revision") command.subjectRevision++;
    if (mode === "missing") command.subjectId = "missing";
    expect(() => updateSubject(f.state, command, actor, "edit", "2026-11-13T09:00:00Z")).toThrow();
  });
  it.each(["snapshot", "root", "missing-event", "status", "origin", "boundary", "legacy-version"])("rejects a tampered lifecycle: %s", mode => {
    const f = fixture(), next = f.update();
    if (mode === "snapshot") next.history[0].after!.name = "Подмена";
    if (mode === "root") next.subjects[0].shortName = "Подмена";
    if (mode === "missing-event") next.history = [];
    if (mode === "status") next.subjects[0].status = "archived";
    if (mode === "origin") delete next.history[0].origin;
    if (mode === "boundary") next.legacy!.historyLength++;
    if (mode === "legacy-version") next.version = 1;
    expect(() => decodeSubjectCatalog(JSON.stringify(next))).toThrow();
  });
  it("counts active links independently of access blocking and keeps historical publications out of blockers", () => {
    const f = fixture(), supervised = assessmentSupervisorFixture();
    const schedule = f.core.schedule; schedule.drafts[0].lessons[0].subjectId = "subject-1";
    f.core.accounts.accounts[1].status = "blocked";
    const result = getSubjectDependencies("subject-1", f.core.accounts.accounts, schedule, supervised.source.document, Date.parse("2026-11-13T09:00:00Z"));
    expect(result).toEqual({ teachingAssignments: 1, draftLessons: 1, futurePublishedLessons: 0, unfinishedAssessments: 0 });
    expect(getSubjectDependencies("subject-1", [], { ...schedule, drafts: [] }, supervised.initial, Date.now()).unfinishedAssessments).toBe(1);
  });
  it("does not write, migrate or normalize a legacy document on read", () => {
    const state: SubjectCatalogDocument = fixture().state, raw = JSON.stringify(state);
    expect(decodeSubjectCatalog(raw)).toEqual(state); expect(JSON.stringify(state)).toBe(raw); expect(state.version).toBe(1);
  });
  it("prevents creating attempts for an archived subject while preserving published record projections", () => {
    const source = assessmentCorrectionFixture(); source.context.subjects[0].status = "archived";
    expect(() => source.run(source.initial, { type: "add-attempt", assessmentId: source.ids.assessmentId, kind: "retake", draft: { date: "2026-11-14", startsAt: "12:00", room: "101", teacherId: "teacher-1", chairId: null, memberIds: [], studentIds: ["student-1"] } })).toThrow("восстановите");
    expect(source.initial.assessments[0].attempts[0].state).toBe("published");
  });
  it("inspects schema 2 and compares all lifecycle fields while keeping values in the explicit preview", async () => {
    const f = fixture(), archived = structuredClone(f.core.archive.localStorage), updated = f.update(f.state, "PRIVATE SUBJECT NAME");
    Object.assign(f.core.subjects, updated); const current = f.core.save().localStorage;
    const review = await inspectBackupDocuments(f.core.archive, "configurator-demo");
    expect(review.checks).toContainEqual(expect.objectContaining({ kind: "subjects", status: "valid" }));
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "legacy-subject-snapshot" })); expect(JSON.stringify(review)).not.toContain("PRIVATE");
    const comparison = await compareBackupCatalogRecords(archived, current); expect(comparison.subjects.differences[0].fields).toContain("previousNames"); expect(JSON.stringify(comparison)).not.toContain("PRIVATE");
    const preview = await readBackupRecordPreview(archived, current, comparison.subjects.differences[0]); expect(preview.hasUnpreviewedFields).toBe(false); expect(JSON.stringify(preview)).toContain("PRIVATE SUBJECT NAME");
  });
});
