import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSubjectLessons } from "./lessons";
import { getDemoWeekSchedule } from "./schedule";
import { getJournalViewSnapshot } from "./journalStore";
import { readAnalyticsJournals } from "./teacherAnalytics";
import { createInitialAccountsDocument } from "./accountStore";
import { createEmptyManagedSchedule, MANAGED_SCHEDULE_KEY, type ManagedJournalEntry } from "../domain/scheduleManagement";
import type { ManagedScheduleRead } from "./managedScheduleStore";

const subject = "theory-of-probability"; const group = "112-mko";
let values: Map<string, string>; const write = vi.fn();
beforeEach(() => {
  values = new Map(); write.mockClear();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: write });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 11, 31, 12));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const lesson: ManagedJournalEntry = { id: "managed:clock", scheduleId: 990001, subjectId: subject, groupId: group, teacherId: "teacher-elena-volkova", teacherName: "Волкова Е.В.", date: "2026-10-19", startsAt: "09:00", endsAt: "10:30", type: "practice", room: "305", journalState: "active" };
const scheduleSource = (): ManagedScheduleRead => ({ error: "", snapshot: { ...createEmptyManagedSchedule(), journal: [{ ...lesson }], published: [{ weekStart: "2026-10-19", groupId: group, lessons: [{ ...lesson }] }] } });

describe("explicit time and read snapshots", () => {
  it("changes a demo lesson at its actual ending boundary using the supplied clock", () => {
    const end = new Date(2026, 8, 14, 10).getTime();
    const before = createSubjectLessons(subject, group, end - 1, []); const after = createSubjectLessons(subject, group, end, []);
    const id = `${subject}:${group}:2026-fall:weekly:2026-09-14:lecture`;
    expect(before.find((entry) => entry.id === id)?.state).toBe("scheduled"); expect(after.find((entry) => entry.id === id)?.state).toBe("completed");
    expect(after.map((entry) => entry.id)).toEqual(before.map((entry) => entry.id));
  });
  it("uses the supplied managed journal and time while preserving cancelled and rescheduled entries", () => {
    const end = new Date(2026, 9, 19, 10, 30).getTime();
    const journal = [lesson, { ...lesson, id: "managed:cancelled", journalState: "cancelled" as const }, { ...lesson, id: "managed:rescheduled", journalState: "rescheduled" as const }];
    const original = structuredClone(journal); values.set(MANAGED_SCHEDULE_KEY, "corrupt current source");
    expect(createSubjectLessons(subject, group, end - 1, journal).find((entry) => entry.id === lesson.id)?.state).toBe("scheduled");
    const next = createSubjectLessons(subject, group, end, journal);
    expect(next.find((entry) => entry.id === lesson.id)?.state).toBe("completed");
    expect(next.find((entry) => entry.id === "managed:cancelled")?.state).toBe("cancelled"); expect(next.find((entry) => entry.id === "managed:rescheduled")?.state).toBe("rescheduled");
    expect(journal).toEqual(original); expect(values.get(MANAGED_SCHEDULE_KEY)).toBe("corrupt current source"); expect(write).not.toHaveBeenCalled();
  });
  it("feeds the same explicit clock into teacher analytics instead of reading a different instant", () => {
    const end = new Date(2026, 8, 14, 10).getTime(); const memberships = [{ subjectId: subject, groupIds: [group] }];
    const before = readAnalyticsJournals(memberships, end - 1); const after = readAnalyticsJournals(memberships, end);
    expect(before.warnings).toEqual([]); expect(after.warnings).toEqual([]);
    const id = `${subject}:${group}:2026-fall:weekly:2026-09-14:lecture`;
    expect(before.journals[0].lessons.find((entry) => entry.id === id)?.state).toBe("scheduled"); expect(after.journals[0].lessons.find((entry) => entry.id === id)?.state).toBe("completed");
  });
  it("rebuilds a week from a new supplied publication while preserving the prior snapshot and storage", () => {
    const date = new Date(2026, 9, 19); const source = scheduleSource(); const original = structuredClone(source);
    values.set(MANAGED_SCHEDULE_KEY, "corrupt current source");
    expect(getDemoWeekSchedule(date, source).find((entry) => entry.id === lesson.scheduleId)?.location).toBe("Ауд. 305");
    const updated = scheduleSource(); updated.snapshot.published[0].lessons[0].room = "999";
    expect(getDemoWeekSchedule(date, updated).find((entry) => entry.id === lesson.scheduleId)?.location).toBe("Ауд. 999");
    expect(getDemoWeekSchedule(date, source).find((entry) => entry.id === lesson.scheduleId)?.location).toBe("Ауд. 305");
    expect(getDemoWeekSchedule(date)).toEqual([]); expect(source).toEqual(original); expect(write).not.toHaveBeenCalled();
  });
  it("does not display a publication from an unavailable supplied schedule", () => {
    const source = scheduleSource(); source.error = "Источник недоступен";
    expect(getDemoWeekSchedule(new Date(2026, 9, 19), source)).toEqual([]); expect(write).not.toHaveBeenCalled();
  });
});

describe("journal view from explicit account and lesson sources", () => {
  const raw = JSON.stringify([{ id: "anna-smirnova", name: "Анна Смирнова", attendance: { [lesson.id]: "present" }, grades: { [lesson.id]: 5 } }]);
  const lessons = () => createSubjectLessons(subject, group, Date.now(), [lesson]);
  it("adds a newly registered student without changing saved grades or inventing marks", () => {
    const accounts = createInitialAccountsDocument().accounts; const source = { accounts, lessons: lessons() };
    const before = getJournalViewSnapshot(raw, subject, group, source)!;
    const added = { ...accounts[1], id: "registered-student", name: "Новый студент", login: "new.student", studentGroupId: group, memberships: [] };
    const after = getJournalViewSnapshot(raw, subject, group, { ...source, accounts: [...accounts, added] })!;
    expect(before.some((student) => student.id === added.id)).toBe(false); expect(after.find((student) => student.id === "anna-smirnova")).toEqual(before.find((student) => student.id === "anna-smirnova"));
    const student = after.find((entry) => entry.id === added.id)!;
    expect(student.name).toBe(added.name); expect(student.attendance).toEqual({}); expect(Object.values(student.grades).every((value) => value === null)).toBe(true);
    expect(accounts).toHaveLength(3); expect(write).not.toHaveBeenCalled();
  });
  it("rechecks lecture eligibility from a new lesson snapshot without rewriting saved bytes", () => {
    const source = { accounts: createInitialAccountsDocument().accounts, lessons: lessons() };
    const practice = getJournalViewSnapshot(raw, subject, group, source)!;
    const lecture = getJournalViewSnapshot(raw, subject, group, { ...source, lessons: source.lessons.map((entry) => entry.id === lesson.id ? { ...entry, type: "lecture" } : entry) })!;
    expect(practice[0].grades[lesson.id]).toBe(5); expect(lecture[0].grades[lesson.id]).toBeNull(); expect(lecture[0].attendance).toEqual(practice[0].attendance);
    expect(JSON.parse(raw)[0].grades[lesson.id]).toBe(5); expect(write).not.toHaveBeenCalled();
  });
  it("keeps damaged saved input unavailable instead of replacing it with a seeded roster", () => {
    const source = { accounts: createInitialAccountsDocument().accounts, lessons: lessons() };
    expect(getJournalViewSnapshot("corrupt journal", subject, group, source)).toBeNull(); expect(write).not.toHaveBeenCalled();
  });
});
