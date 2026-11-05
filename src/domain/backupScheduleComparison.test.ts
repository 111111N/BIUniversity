import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertCompleteScheduleComparison, compareBackupScheduleRecords, getUncheckedScheduleDocuments } from "./backupScheduleComparison";
import { getBackupDifferenceKey } from "./backupComparison";
import { MANAGED_SCHEDULE_KEY } from "./scheduleManagement";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";
import * as scheduleModule from "./scheduleManagement";

const setup = (publish = false) => {
  const fixture = coreBackupFixture();
  if (publish) { fixture.schedule.published = structuredClone(fixture.schedule.drafts); fixture.schedule.journal = fixture.schedule.published.flatMap((week) => week.lessons.map((lesson) => ({ ...lesson, journalState: "active" as const }))); fixture.save(); }
  return fixture;
};
const forbidden = vi.fn(() => { throw new Error("No live schedule reads or writes"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("saved draft and published lesson comparison", () => {
  it("validates identical snapshot text once per comparison without retaining it across invocations", async () => {
    const fixture = setup(true); const parse = vi.spyOn(scheduleModule, "decodeManagedSchedule");
    await compareBackupScheduleRecords(fixture.archive.localStorage, fixture.archive.localStorage);
    expect(parse).toHaveBeenCalledTimes(1);
    await compareBackupScheduleRecords(fixture.archive.localStorage, fixture.archive.localStorage);
    expect(parse).toHaveBeenCalledTimes(2);
  });
  it("keeps the same lesson ID separate across draft and publication and preserves snapshots", async () => {
    const fixture = setup(true); const before = JSON.stringify(fixture.archive);
    const review = await compareBackupScheduleRecords(fixture.archive.localStorage, []);
    expect(review.drafts.counts.new).toBe(1); expect(review.published.counts.new).toBe(1);
    expect(new Set([...review.drafts.differences, ...review.published.differences].map(getBackupDifferenceKey)).size).toBe(2);
    expect(() => assertCompleteScheduleComparison(review)).not.toThrow(); expect(JSON.stringify(fixture.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("names all changed fields without teacher names, rooms, dates or other raw values", async () => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage); const week = fixture.schedule.drafts[0];
    Object.assign(week.lessons[0], { scheduleId: 2, subjectId: "PRIVATE SUBJECT", groupId: "PRIVATE GROUP", teacherId: "PRIVATE TEACHER ID", teacherName: "PRIVATE TEACHER NAME", date: "2026-11-02", startsAt: "11:00", endsAt: "12:30", type: "laboratory", room: "PRIVATE ROOM" });
    week.groupId = "PRIVATE GROUP"; week.weekStart = "2026-11-02"; fixture.save();
    const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    expect(review.drafts.differences[0].fields).toEqual(["scheduleId", "subjectId", "groupId", "teacherId", "teacherName", "date", "startsAt", "endsAt", "type", "room"]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review)).not.toContain("2026-11-02");
  });
  it("compares publication changes only after validating the published-journal link", async () => {
    const fixture = setup(true); const original = structuredClone(fixture.archive.localStorage);
    fixture.schedule.published[0].lessons[0].room = "PRIVATE ROOM"; fixture.schedule.journal[0].room = "PRIVATE ROOM"; fixture.save();
    const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    expect(review.drafts.counts.same).toBe(1); expect(review.published.differences[0].fields).toEqual(["room"]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it("does not use publication as a missing draft or turn a move between modes into a match", async () => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage);
    fixture.schedule.published = structuredClone(fixture.schedule.drafts); fixture.schedule.drafts = [];
    fixture.schedule.journal = fixture.schedule.published.flatMap((week) => week.lessons.map((lesson) => ({ ...lesson, journalState: "active" as const }))); fixture.save();
    const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    expect(review.drafts.counts).toMatchObject({ same: 0, new: 1, currentOnly: 0 });
    expect(review.published.counts).toMatchObject({ same: 0, new: 0, currentOnly: 1 });
  });
  it("does not match lessons by room, time or subject when their IDs differ", async () => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage);
    fixture.schedule.drafts[0].lessons[0].id = "managed:other"; fixture.save();
    const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    expect(review.drafts.counts).toMatchObject({ same: 0, new: 1, currentOnly: 1 });
  });
  it("keeps document revisions and week metadata outside the lesson statistics", async () => {
    const fixture = setup(true); const original = structuredClone(fixture.archive.localStorage);
    fixture.schedule.revision++; Object.assign(fixture.schedule.drafts[0], { updatedBy: "PRIVATE", updatedAt: "2026-11-05T00:00Z" });
    Object.assign(fixture.schedule.published[0], { publishedBy: "PRIVATE", publishedAt: "2026-11-05T00:00Z" }); fixture.save();
    const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    expect(review.drafts.counts.same).toBe(1); expect(review.published.counts.same).toBe(1);
    expect(review.drafts.differences).toEqual([]); expect(review.published.differences).toEqual([]);
  });
  it.each(["duplicate-id", "journal-link", "sunday", "week-scope"])("rejects an inconsistent complete schedule source: %s", async (reason) => {
    const fixture = setup(true); const original = structuredClone(fixture.archive.localStorage);
    if (reason === "duplicate-id") fixture.schedule.drafts[0].lessons.push({ ...fixture.schedule.drafts[0].lessons[0] });
    if (reason === "journal-link") fixture.schedule.journal = [];
    if (reason === "sunday") fixture.schedule.drafts[0].lessons[0].date = "2026-11-01";
    if (reason === "week-scope") fixture.schedule.drafts[0].weekStart = "2026-11-02";
    fixture.save(); const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    for (const part of [review.drafts, review.published]) { expect(part.counts).toMatchObject({ uncheckedDocuments: 1, new: 0, currentOnly: 0 }); expect(part.differences).toEqual([]); }
    expect(getUncheckedScheduleDocuments(review)).toBe(1);
  });
  it("retains unknown lesson fields without leaking them or normalizing room text", async () => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage);
    Object.assign(fixture.schedule.drafts[0].lessons[0], { room: "ауд. 101", PRIVATE_EXTENSION: "PRIVATE" }); fixture.save();
    const review = await compareBackupScheduleRecords(original, fixture.archive.localStorage);
    expect(review.drafts.differences[0].fields).toEqual(["room", "other"]); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it("distinguishes absent, empty, malformed and future sources", async () => {
    const fixture = setup(); const entry = fixture.archive.localStorage.find((row) => row.key === MANAGED_SCHEDULE_KEY)!;
    expect((await compareBackupScheduleRecords([], [])).drafts.counts.documents).toBe(0);
    const empty = { ...fixture.schedule, drafts: [], published: [], journal: [] };
    expect((await compareBackupScheduleRecords([{ key: MANAGED_SCHEDULE_KEY, raw: JSON.stringify(empty) }], [])).drafts.counts.comparedDocuments).toBe(1);
    expect((await compareBackupScheduleRecords([{ ...entry, key: "bi-university-managed-schedule-v2" }], [])).drafts.uncompared[0].reason).toBe("unsupported-key");
    expect((await compareBackupScheduleRecords([{ ...entry, raw: "PRIVATE{broken" }], [])).drafts.uncompared[0].reason).toBe("invalid-document");
  });
  it("keeps every lesson after 200, supports cancellation and rejects incomplete mode reports", async () => {
    const fixture = setup(); const lesson = fixture.schedule.drafts[0].lessons[0];
    fixture.schedule.drafts[0].lessons = Array.from({ length: 230 }, (_, index) => ({ ...lesson, id: `managed:lesson-${String(index).padStart(3, "0")}`, scheduleId: index + 1 })); fixture.save();
    const review = await compareBackupScheduleRecords(fixture.archive.localStorage, []);
    expect(review.drafts.counts.new).toBe(230); expect(review.drafts.differences.at(-1)?.id).toBe("managed:lesson-229");
    expect(() => assertCompleteScheduleComparison(review)).not.toThrow(); review.drafts.differences.pop();
    expect(() => assertCompleteScheduleComparison(review)).toThrow("неполный отчёт");
    const pending = new AbortController(); setTimeout(() => pending.abort(), 0);
    await expect(compareBackupScheduleRecords(fixture.archive.localStorage, [], pending.signal)).rejects.toMatchObject({ name: "AbortError" }); expect(forbidden).not.toHaveBeenCalled();
  });
});
