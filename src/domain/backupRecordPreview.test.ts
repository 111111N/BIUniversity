import { afterEach, describe, expect, it, vi } from "vitest";
import { canPreviewBackupDifference, readBackupRecordPreview } from "./backupRecordPreview";
import { compareBackupPlannerRecords } from "./backupPlannerComparison";
import { compareBackupLearningRecords } from "./backupLearningComparison";
import { compareBackupScheduleRecords } from "./backupScheduleComparison";
import { plannerBackupFixture, learningBackupFixture, coreBackupFixture } from "../testSupport/localBackupDocuments";

afterEach(() => vi.unstubAllGlobals());
describe("read-only changed-field preview", () => {
  it("returns only changed supported fields without reading live storage", async () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("Live reads forbidden"); } });
    const state = plannerBackupFixture(); const archive = structuredClone(state.archive.localStorage); state.notes[0].text = "PRIVATE CURRENT"; state.save();
    const comparison = await compareBackupPlannerRecords(archive, state.archive.localStorage); const difference = comparison.differences[0];
    const preview = await readBackupRecordPreview(archive, state.archive.localStorage, difference);
    expect(preview.rows).toEqual([{ field: "text", label: "Текст", archive: '"PRIVATE NOTE TEXT"', browser: '"PRIVATE CURRENT"' }]);
    expect(JSON.stringify(preview)).not.toContain("PRIVATE NOTE TITLE"); expect(JSON.stringify(comparison)).not.toContain("PRIVATE");
  });
  it("preserves missing, null and empty values without substituting defaults", async () => {
    const state = plannerBackupFixture(); const archive = structuredClone(state.archive.localStorage); Object.assign(state.notes[0], { text: "", endAt: undefined }); state.save();
    const comparison = await compareBackupPlannerRecords(archive, state.archive.localStorage); const preview = await readBackupRecordPreview(archive, state.archive.localStorage, comparison.differences[0]);
    expect(preview.rows.find(row => row.field === "text")?.browser).toBe('""'); expect(preview.rows.find(row => row.field === "endAt")?.browser).toBe("Поле отсутствует");
  });
  it("resolves an attempt by both its ID and parent submission", async () => {
    const state = learningBackupFixture(); const archive = structuredClone(state.archive.localStorage);
    state.submissions[0].text = "PRIVATE NEW ATTEMPT"; state.submissions[0].attempts![0].text = "PRIVATE NEW ATTEMPT"; state.save();
    const comparison = await compareBackupLearningRecords(archive, state.archive.localStorage); const difference = comparison.attempts!.differences[0];
    const preview = await readBackupRecordPreview(archive, state.archive.localStorage, difference);
    expect(preview.reference).toMatchObject({ parentId: "answer-1", id: "attempt-1" }); expect(preview.rows[0].field).toBe("text");
    const wrong = structuredClone(difference); Object.assign(wrong.reference!, { parentId: "another-answer" }); await expect(readBackupRecordPreview(archive, state.archive.localStorage, wrong)).rejects.toThrow("не подтверждён");
  });
  it("resolves a schedule link inside its exact subject/group scope", async () => {
    const state = coreBackupFixture(); const lesson = state.schedule.drafts[0].lessons[0]; state.schedule.drafts = []; state.schedule.journal = [{ ...lesson, journalState: "cancelled" }]; state.save();
    const archive = structuredClone(state.archive.localStorage); state.schedule.journal[0].room = "PRIVATE NEW ROOM"; state.save();
    const comparison = await compareBackupScheduleRecords(archive, state.archive.localStorage); const difference = comparison.journal!.differences[0];
    const preview = await readBackupRecordPreview(archive, state.archive.localStorage, difference); expect(preview.rows[0]).toMatchObject({ field: "room", browser: '"PRIVATE NEW ROOM"' });
    const wrong = structuredClone(difference); Object.assign(wrong.reference!, { groupId: "another-group" }); await expect(readBackupRecordPreview(archive, state.archive.localStorage, wrong)).rejects.toThrow("не подтверждён");
  });
  it("does not reveal unknown additional fields or their names", async () => {
    const state = plannerBackupFixture(); const archive = structuredClone(state.archive.localStorage); Object.assign(state.notes[0], { "PRIVATE FIELD": "PRIVATE SECRET" }); state.save();
    const comparison = await compareBackupPlannerRecords(archive, state.archive.localStorage); const preview = await readBackupRecordPreview(archive, state.archive.localStorage, comparison.differences[0]);
    expect(preview.rows).toEqual([]); expect(preview.hasUnpreviewedFields).toBe(true); expect(JSON.stringify(preview)).not.toContain("PRIVATE");
  });
  it("rejects oversized values without returning partial text", async () => {
    const state = plannerBackupFixture(); const archive = structuredClone(state.archive.localStorage); state.notes[0].text = "x".repeat(70000); state.save();
    const comparison = await compareBackupPlannerRecords(archive, state.archive.localStorage);
    await expect(readBackupRecordPreview(archive, state.archive.localStorage, comparison.differences[0])).rejects.toThrow("Частичный текст не показан");
  });
  it("rejects non-conflicts, unsupported references and stale differences", async () => {
    expect(canPreviewBackupDifference({ kind: "schema", area: "a", id: "id" })).toBe(false);
    expect(canPreviewBackupDifference({ kind: "different", area: "a", id: "id", reference: { storage: "localStorage", key: "key" } })).toBe(false);
    const state = plannerBackupFixture(); const archive = structuredClone(state.archive.localStorage); state.notes[0].text = "changed"; state.save();
    const comparison = await compareBackupPlannerRecords(archive, state.archive.localStorage); const difference = comparison.differences[0];
    await expect(readBackupRecordPreview(archive, archive, difference)).rejects.toThrow("не подтверждён");
    const controller = new AbortController(); controller.abort(); await expect(readBackupRecordPreview(archive, state.archive.localStorage, difference, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
