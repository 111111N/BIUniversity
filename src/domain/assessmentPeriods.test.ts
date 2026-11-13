import { describe, expect, it } from "vitest";
import { academicPeriodsFixture } from "../testSupport/academicPeriods";
import { assessmentSupervisorFixture } from "../testSupport/assessmentSupervisors";
import { assessmentBackupFixture } from "../testSupport/assessmentBackup";
import { executeAcademicPeriodCommand } from "./academicPeriods";
import { applyAssessmentCommand, decodeAssessmentDocument, emptyAssessmentDocument, projectAssessments } from "./assessments";
import { assessmentPeriodExistsInHistory, resolveAssessmentAcademicPeriod } from "./assessmentPeriods";
import { createAssessmentStatement } from "./assessmentExport";
import type { AssessmentCommand, AssessmentCommandContext, AssessmentDocument, AssessmentKind } from "./assessmentTypes";
import { ACADEMIC_PERIODS_STORAGE_KEY } from "./academicPeriods";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { inspectSelectedAssessmentReferences } from "./backupAssessmentReferences";
import { reviewBackupAssessmentSelection } from "./backupAssessmentSelection";
import { compareBackupAssessmentRecords } from "./backupAssessmentComparison";

type Payload = { [K in AssessmentCommand["type"]]: Omit<Extract<AssessmentCommand, { type: K }>, keyof AssessmentCommandContext> }[AssessmentCommand["type"]];
const linkedAssessmentFixture = (kind: AssessmentKind = "exam") => {
  const source = assessmentSupervisorFixture(kind), periods = academicPeriodsFixture(), context = { ...source.context, academicPeriods: periods };
  const run = (state: AssessmentDocument, payload: Payload, actorId = "configurator-demo", occurredAt = "2026-11-13T09:00:00.000Z") => applyAssessmentCommand(state,
    { ...payload, actorId, actorRevision: 1, expectedRevision: state.revision, accountsRevision: 1, groupRevision: 1, subjectRevision: 1 }, context,
    { assessmentId: `linked-${state.revision}`, attemptId: `linked-attempt-${state.revision}`, historyId: `linked-history-${state.revision}`, occurredAt });
  const draft = { kind, title: "Аттестация с периодом", subjectId: "subject-1", groupId: "group-1", period: "ignored client label", academicPeriod: { termId: "term-autumn", expectedRevision: periods.revision }, attempt: source.assignment, recordBook: { semester: 7, hours: 72, category: "required" as const } };
  const initial = run(emptyAssessmentDocument(), { type: "create", draft });
  return { source, periods, context, run, draft, initial };
};

describe("assessment academic period snapshots", () => {
  it.each<AssessmentKind>(["exam", "pass", "gradedPass", "internship", "thesis", "coursework"])("binds %s to an explicit period without inferring the student's semester", kind => {
    const { initial, periods } = linkedAssessmentFixture(kind), assessment = initial.assessments[0];
    expect(initial.version).toBe(6); expect(assessment.period).toBe("2026/2027 · осенний семестр");
    expect(assessment.academicPeriod).toEqual({ catalogRevision: 2, year: periods.years[0], term: periods.terms[0] });
    expect(initial.history[0].academicPeriod).toEqual(assessment.academicPeriod); expect(assessment.recordBook?.semester).toBe(7);
    expect(decodeAssessmentDocument(JSON.stringify(initial))).toEqual(initial);
  });
  it("preserves old text-only statements when appending a linked assessment", () => {
    const f = linkedAssessmentFixture(), legacy = assessmentBackupFixture().document, before = JSON.stringify(legacy);
    const combined = f.run(legacy, { type: "create", draft: f.draft });
    expect(combined.version).toBe(6); expect(combined.assessments[0]).toEqual(legacy.assessments[0]); expect(combined.history.slice(0, legacy.history.length)).toEqual(legacy.history);
    expect(combined.assessments[0]).not.toHaveProperty("academicPeriod"); expect(JSON.stringify(legacy)).toBe(before); expect(decodeAssessmentDocument(before).version).toBe(5);
  });
  it.each(["missing", "unknown", "stale", "extra", "unavailable"])("rejects an invalid selection: %s", mode => {
    const f = linkedAssessmentFixture(), draft = structuredClone(f.draft);
    if (mode === "missing") delete (draft as { academicPeriod?: unknown }).academicPeriod;
    if (mode === "unknown") draft.academicPeriod.termId = "missing";
    if (mode === "stale") draft.academicPeriod.expectedRevision++;
    if (mode === "extra") Object.assign(draft.academicPeriod, { yearId: "forged" });
    if (mode === "unavailable") delete (f.context as { academicPeriods?: unknown }).academicPeriods;
    expect(() => f.run(emptyAssessmentDocument(), { type: "create", draft })).toThrow();
  });
  it.each(["root-version", "label", "year-id", "year-date", "term-date", "revision", "missing-audit", "changed-audit", "extra-field"])("rejects corrupted snapshot data: %s", mode => {
    const { initial } = linkedAssessmentFixture(), period = initial.assessments[0].academicPeriod!;
    if (mode === "root-version") initial.version = 5;
    if (mode === "label") initial.assessments[0].period = "forged";
    if (mode === "year-id") period.year.id = "another-year";
    if (mode === "year-date") period.year.startsOn = "2026-02-30";
    if (mode === "term-date") period.term.endsOn = "2028-01-01";
    if (mode === "revision") period.catalogRevision = 1;
    if (mode === "missing-audit") delete initial.history[0].academicPeriod;
    if (mode === "changed-audit") initial.history[0].academicPeriod!.term.name = "forged";
    if (mode === "extra-field") Object.assign(period.term, { ordinal: 7 });
    expect(() => decodeAssessmentDocument(JSON.stringify(initial))).toThrow();
  });
  it("retains historical calendar values after valid renames and date changes", () => {
    const f = linkedAssessmentFixture(), actor = f.source.context.accounts.find(row => row.id === "configurator-demo")!, before = JSON.stringify(f.initial);
    const changed = executeAcademicPeriodCommand(f.periods, { actorId: actor.id, actorRevision: 1, expectedRevision: 2, type: "update-term", termId: "term-autumn", entityRevision: 1, draft: { name: "Изменённый семестр", startsOn: "2026-09-01", endsOn: "2027-02-10" } }, actor,
      { entityId: "term-autumn", eventId: "renamed", occurredAt: "2026-11-14T09:00:00.000Z" });
    expect(assessmentPeriodExistsInHistory(f.initial.assessments[0].academicPeriod!, changed, f.initial.assessments[0].attempts[0].createdAt)).toBe(true);
    expect(JSON.stringify(f.initial)).toBe(before); expect(f.initial.assessments[0].period).not.toContain("Изменённый");
  });
  it("rejects invented historical snapshots and calendars saved after the assessment", () => {
    const f = linkedAssessmentFixture(), snapshot = structuredClone(f.initial.assessments[0].academicPeriod!);
    snapshot.term.name = "Имя, которого не было"; expect(assessmentPeriodExistsInHistory(snapshot, f.periods, "2026-11-13T09:00:00Z")).toBe(false);
    expect(() => resolveAssessmentAcademicPeriod(f.periods, f.draft.academicPeriod, "2026-09-30T09:00:00Z")).toThrow("предшествовать");
    expect(assessmentPeriodExistsInHistory(f.initial.assessments[0].academicPeriod!, f.periods, "2026-09-30T09:00:00Z")).toBe(false);
  });
  it("keeps the saved period through results, publication, a retake beyond the semester and a correction", () => {
    const f = linkedAssessmentFixture(), assessment = f.initial.assessments[0], period = structuredClone(assessment.academicPeriod), ids = { assessmentId: assessment.id, attemptId: assessment.attempts[0].id };
    const results = [{ studentId: "student-1", outcome: { status: "graded" as const, grade: 5 as const } }];
    let state = f.run(f.initial, { type: "save-results", ...ids, results }, "teacher-1"); state = f.run(state, { type: "publish", ...ids }, "teacher-1");
    const file = createAssessmentStatement(state, { actorId: "teacher-1", actorRevision: 1, expectedRevision: state.revision, accountsRevision: 1, groupRevision: 1, subjectRevision: 1, ...ids }, f.context);
    expect(file.csv).toContain("ID учебного года"); expect(file.csv).toContain("term-autumn"); expect(file.csv).toContain("осенний семестр");
    state = f.run(state, { type: "open-correction", ...ids, reason: "Исправление результата" });
    const correctionId = state.corrections[0].id;
    state = f.run(state, { type: "save-correction", ...ids, correctionId, results: [{ studentId: "student-1", outcome: { status: "graded", grade: 4 } }] }, "teacher-1");
    state = f.run(state, { type: "publish-correction", ...ids, correctionId }, "teacher-1");
    state = f.run(state, { type: "add-attempt", assessmentId: assessment.id, kind: "retake", draft: { ...f.source.assignment, date: "2027-02-20", room: "101" } });
    expect(state.assessments[0].academicPeriod).toEqual(period); expect(state.version).toBe(6);
    const student = f.context.accounts.find(row => row.id === "student-1")!;
    expect(projectAssessments(state, student)[0].academicPeriod).toEqual(period);
    expect(state.history.filter(row => row.academicPeriod)).toHaveLength(1);
  });
  it("accepts maximum normalized names without truncating the saved label", () => {
    const f = linkedAssessmentFixture(), actor = f.context.accounts.find(row => row.id === "configurator-demo")!;
    let periods = executeAcademicPeriodCommand(f.periods, { actorId: actor.id, actorRevision: 1, expectedRevision: 2, type: "update-year", yearId: "year-2026", entityRevision: 1, draft: { name: "Г".repeat(160), startsOn: "2026-09-01", endsOn: "2027-08-31" } }, actor, { entityId: "year-2026", eventId: "year-long-name", occurredAt: "2026-10-02T09:00:00.000Z" });
    periods = executeAcademicPeriodCommand(periods, { actorId: actor.id, actorRevision: 1, expectedRevision: 3, type: "update-term", termId: "term-autumn", entityRevision: 1, draft: { name: "С".repeat(160), startsOn: "2026-09-01", endsOn: "2027-01-31" } }, actor, { entityId: "term-autumn", eventId: "term-long-name", occurredAt: "2026-10-02T09:00:00.000Z" });
    f.context.academicPeriods = periods;
    const state = f.run(emptyAssessmentDocument(), { type: "create", draft: { ...f.draft, academicPeriod: { termId: "term-autumn", expectedRevision: 4 } } });
    expect(state.assessments[0].period).toHaveLength(323); expect(decodeAssessmentDocument(JSON.stringify(state))).toEqual(state);
  });
  it("validates saved period history from the archive and carries v6 through selected-set checks", async () => {
    const f = linkedAssessmentFixture(), archive = f.source.source.save(f.initial);
    archive.completedAt = "2026-11-13T09:00:00.000Z";
    archive.localStorage.push({ key: ACADEMIC_PERIODS_STORAGE_KEY, raw: JSON.stringify(f.periods) });
    const before = JSON.stringify(archive), review = await inspectBackupDocuments(archive, "configurator-demo");
    expect(review.issues.filter(row => row.level === "error")).toEqual([]); expect(review.issues.some(row => row.code === "unconfirmed-assessment-period")).toBe(true);
    const selected = await reviewBackupAssessmentSelection(archive.localStorage, [], [], undefined, { choices: [] });
    expect(selected.status).toBe("consistent"); expect(selected.references?.status).toBe("references-present"); expect(JSON.stringify(archive)).toBe(before);
  });
  it.each(["missing", "damaged", "different", "invented-snapshot"])("blocks unconfirmed selected period references: %s", async mode => {
    const f = linkedAssessmentFixture(), archive = f.source.source.save(f.initial), calendar = { key: ACADEMIC_PERIODS_STORAGE_KEY, raw: JSON.stringify(f.periods) };
    const browser = mode === "different" ? [calendar] : [];
    if (mode !== "missing") archive.localStorage.push({ ...calendar });
    if (mode === "damaged") archive.localStorage.at(-1)!.raw = "damaged";
    if (mode === "different") {
      const actor = f.context.accounts.find(row => row.id === "configurator-demo")!;
      const changed = executeAcademicPeriodCommand(f.periods, { actorId: actor.id, actorRevision: 1, expectedRevision: 2, type: "update-term", termId: "term-autumn", entityRevision: 1, draft: { name: "Новая версия семестра", startsOn: "2026-09-01", endsOn: "2027-01-31" } }, actor, { entityId: "term-autumn", eventId: "term-renamed", occurredAt: "2026-11-13T09:00:00.000Z" });
      archive.localStorage.at(-1)!.raw = JSON.stringify(changed);
    }
    if (mode === "invented-snapshot") {
      f.initial.assessments[0].academicPeriod!.term.name = "Выдуманный семестр"; f.initial.assessments[0].period = "2026/2027 · Выдуманный семестр"; f.initial.history[0].academicPeriod = structuredClone(f.initial.assessments[0].academicPeriod);
      expect(() => decodeAssessmentDocument(JSON.stringify(f.initial))).not.toThrow();
    }
    const result = await inspectSelectedAssessmentReferences(f.initial, archive.localStorage, browser, []);
    expect(result.status).toBe("blocked"); expect(result.issues).toContainEqual(expect.objectContaining({ target: "periods", code: mode === "missing" ? "missing-source" : mode === "damaged" ? "invalid-source" : mode === "different" ? "unresolved-reference" : "missing-reference" }));
  });
  it("compares the period snapshot explicitly, preserving review of changed values", async () => {
    const f = linkedAssessmentFixture(), left = f.source.source.save(f.initial).localStorage;
    const changed = structuredClone(f.initial); changed.assessments[0].academicPeriod!.term.name = "Другое имя"; changed.history[0].academicPeriod = structuredClone(changed.assessments[0].academicPeriod); changed.assessments[0].period = "2026/2027 · Другое имя";
    const right = left.map(row => row.key.includes("assessments-v1") ? { ...row, raw: JSON.stringify(changed) } : row);
    const comparison = await compareBackupAssessmentRecords(left, right);
    expect(JSON.stringify(comparison.assessments.differences)).toContain("academicPeriod"); expect(JSON.stringify(comparison.history.differences)).toContain("academicPeriod");
  });
});
