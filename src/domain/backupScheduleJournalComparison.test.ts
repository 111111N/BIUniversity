import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertCompleteScheduleComparison, compareBackupScheduleRecords, getUncheckedScheduleDocuments } from "./backupScheduleComparison";
import { getBackupDifferenceKey, type BackupDifference } from "./backupComparison";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";
import { MANAGED_SCHEDULE_KEY } from "./scheduleManagement";

const setup = () => {
  const fixture = coreBackupFixture(); const lesson = fixture.schedule.drafts[0].lessons[0];
  fixture.schedule.drafts = []; fixture.schedule.journal = [{ ...lesson, journalState: "cancelled" }]; fixture.save();
  return { ...fixture, entry: fixture.schedule.journal[0] };
};
const forbidden = vi.fn(() => { throw new Error("No live journal/schedule reads or writes"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("schedule journal records scoped by lesson, subject and group", () => {
  it("keeps one lesson ID in different historical areas separate and preserves source snapshots", async () => {
    const fixture = setup(); fixture.schedule.journal.push({ ...fixture.entry, subjectId: "subject-2", groupId: "group-2" }); fixture.save();
    const before = JSON.stringify(fixture.archive); const review = await compareBackupScheduleRecords(fixture.archive.localStorage, fixture.archive.localStorage);
    expect(review.journal?.counts).toMatchObject({ same: 2, different: 0, uncheckedDocuments: 0 });
    expect(review.journalComparisonVersion).toBe(1); expect(() => assertCompleteScheduleComparison(review)).not.toThrow();
    expect(JSON.stringify(fixture.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("names nonidentity changes without copying teacher names, rooms or other values", async () => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage);
    Object.assign(fixture.entry, { scheduleId: 2, teacherId: "PRIVATE TEACHER ID", teacherName: "PRIVATE NAME", date: "2026-11-02", startsAt: "11:00", endsAt: "12:30", type: "lecture", room: "PRIVATE ROOM", journalState: "rescheduled" }); fixture.save();
    const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    expect(review.journal?.differences[0]).toMatchObject({ id: "managed:lesson-1", fields: ["scheduleId", "teacherId", "teacherName", "date", "startsAt", "endsAt", "type", "room", "journalState"], reference: { storage: "localStorage-journal-record", key: MANAGED_SCHEDULE_KEY, collection: "schedule-journal", id: "managed:lesson-1", subjectId: "subject-1", groupId: "group-1" } });
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review.journal)).not.toContain("2026-11-02");
  });
  it.each(["subjectId", "groupId"] as const)("does not match a lesson across changed %s", async (field) => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage);
    fixture.entry[field] = `${field}-other`; fixture.save();
    const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    expect(review.journal?.counts).toMatchObject({ same: 0, new: 1, currentOnly: 1, different: 0 });
    expect(new Set(review.journal!.differences.map(getBackupDifferenceKey)).size).toBe(2);
  });
  it("keeps changes to one area isolated from another with the same lesson ID", async () => {
    const fixture = setup(); const second = { ...fixture.entry, groupId: "group-2" }; fixture.schedule.journal.push(second); fixture.save();
    const original = structuredClone(fixture.archive.localStorage); second.journalState = "rescheduled"; fixture.save();
    const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    expect(review.journal?.counts).toMatchObject({ same: 1, different: 1 });
    expect(review.journal?.differences[0].reference).toMatchObject({ groupId: "group-2" }); expect(review.journal?.differences[0].fields).toEqual(["journalState"]);
  });
  it("does not infer history from publication or accept a broken active link", async () => {
    const fixture = coreBackupFixture(); fixture.schedule.published = structuredClone(fixture.schedule.drafts);
    fixture.schedule.journal = fixture.schedule.published.flatMap((week) => week.lessons.map((lesson) => ({ ...lesson, journalState: "active" as const }))); fixture.save();
    const original = structuredClone(fixture.archive.localStorage); fixture.schedule.journal[0].journalState = "cancelled"; fixture.save();
    const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    for (const part of [review.drafts, review.published, review.journal!]) expect(part.counts).toMatchObject({ uncheckedDocuments: 1, new: 0, currentOnly: 0 });
    expect(getUncheckedScheduleDocuments(review)).toBe(1);
  });
  it("rejects duplicate scoped records instead of choosing one version", async () => {
    const fixture = setup(); fixture.schedule.journal.push({ ...fixture.entry, room: "PRIVATE" }); fixture.save();
    const review = await compareBackupScheduleRecords(fixture.archive.localStorage, []);
    expect(review.journal?.uncompared[0].reason).toBe("invalid-document"); expect(review.journal?.differences).toEqual([]);
  });
  it("keeps unknown journal values and property names out of the report", async () => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage);
    Object.assign(fixture.entry, { PRIVATE_EXTENSION: { value: "PRIVATE" } }); fixture.save();
    const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    expect(review.journal?.differences[0].fields).toEqual(["other"]); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it("does not collapse compound addresses containing separators or quoted IDs", () => {
    const first: BackupDifference = { kind: "different", area: "Journal", id: 'managed:"a', reference: { storage: "localStorage-journal-record", key: MANAGED_SCHEDULE_KEY, collection: "schedule-journal", id: 'managed:"a', subjectId: "b:c", groupId: "d" } };
    const second: BackupDifference = { ...first, reference: { storage: "localStorage-journal-record", key: MANAGED_SCHEDULE_KEY, collection: "schedule-journal", id: first.id, subjectId: "b", groupId: "c:d" } };
    expect(getBackupDifferenceKey(first)).not.toBe(getBackupDifferenceKey(second)); expect(getBackupDifferenceKey(first)).toBe(getBackupDifferenceKey(structuredClone(first)));
  });
  it("retains all areas after 200 and rejects truncated or incorrectly addressed history", async () => {
    const fixture = setup(); fixture.schedule.journal = Array.from({ length: 230 }, (_, index) => ({ ...fixture.entry, groupId: `group-${String(index).padStart(3, "0")}` })); fixture.save();
    const review = await compareBackupScheduleRecords(fixture.archive.localStorage, []);
    expect(review.journal?.counts.new).toBe(230); expect(review.journal?.differences.at(-1)?.reference).toMatchObject({ groupId: "group-229" });
    expect(() => assertCompleteScheduleComparison(review)).not.toThrow();
    const wrong = structuredClone(review); Object.assign(wrong.journal!.differences[0].reference!, { groupId: " " });
    expect(() => assertCompleteScheduleComparison(wrong)).toThrow("неполный отчёт");
    review.journal!.differences.pop(); expect(() => assertCompleteScheduleComparison(review)).toThrow("неполный отчёт");
  });
  it.each(["missing-detail", "unknown-version", "unversioned-detail", "flat-address"])("rejects an incompatible journal section: %s", async (kind) => {
    const fixture = setup(); const review = await compareBackupScheduleRecords(fixture.archive.localStorage, []);
    if (kind === "missing-detail") Reflect.deleteProperty(review, "journal");
    if (kind === "unknown-version") Object.assign(review, { journalComparisonVersion: 2 });
    if (kind === "unversioned-detail") Reflect.deleteProperty(review, "journalComparisonVersion");
    if (kind === "flat-address") Object.assign(review.journal!.differences[0], { reference: { storage: "localStorage-record", key: MANAGED_SCHEDULE_KEY, collection: "schedule-published", id: "managed:lesson-1" } });
    expect(() => assertCompleteScheduleComparison(review)).toThrow("неполный отчёт");
  });
  it("keeps old results compatible without inventing journal detail", async () => {
    const fixture = setup(); const review = await compareBackupScheduleRecords(fixture.archive.localStorage, []);
    Reflect.deleteProperty(review, "journal"); Reflect.deleteProperty(review, "journalComparisonVersion");
    expect(() => assertCompleteScheduleComparison(review)).not.toThrow();
  });
  it("supports cancellation while preserving an incomplete source without writes", async () => {
    const fixture = setup(); fixture.schedule.journal = Array.from({ length: 300 }, (_, index) => ({ ...fixture.entry, groupId: `group-${index}` })); fixture.save();
    const controller = new AbortController(); setTimeout(() => controller.abort(), 0);
    await expect(compareBackupScheduleRecords(fixture.archive.localStorage, [], controller.signal)).rejects.toMatchObject({ name: "AbortError" }); expect(forbidden).not.toHaveBeenCalled();
  });
});
