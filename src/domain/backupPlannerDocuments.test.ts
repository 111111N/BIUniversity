import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectBackupPlanners } from "./backupPlannerDocuments";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { getPlannerStorageKey, getPlannerStorageOwner, LEGACY_PLANNER_OWNER_ID, PLANNER_STORAGE_KEY } from "./plannerStorage";
import { plannerBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("No live reads or writes during archive inspection"); });
const accounts = new Set(["student-1", LEGACY_PLANNER_OWNER_ID]);
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("archived planner lists", () => {
  it("validates the archived owner and tasks without leaking title/text or modifying original strings", async () => {
    const state = plannerBackupFixture(); const before = JSON.stringify(state.archive);
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts).toEqual({ valid: 9, invalid: 0, absent: 4, unchecked: 0, errors: 0, reviews: 0 });
    expect(review.checks).toContainEqual(expect.objectContaining({ kind: "planners", status: "valid", documents: 1, records: 1 }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(state.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });

  it("supports the legacy shared key with its original teacher owner", async () => {
    const review = await inspectBackupPlanners([{ key: PLANNER_STORAGE_KEY, raw: "[]" }], accounts);
    expect(getPlannerStorageOwner(PLANNER_STORAGE_KEY)).toBe(LEGACY_PLANNER_OWNER_ID);
    expect(review.issues).toEqual([]); expect(review.checks[0]).toMatchObject({ status: "valid", records: 0 });
  });

  it.each(["teacher-1", "пользователь", "campus/student", "id%2Fpart"])("uses the same canonical encoded key for owner %s", async (owner) => {
    const key = getPlannerStorageKey(owner);
    expect(getPlannerStorageOwner(key)).toBe(owner);
    expect((await inspectBackupPlanners([{ key, raw: "[]" }], new Set([owner]))).issues).toEqual([]);
  });

  it.each([
    `${PLANNER_STORAGE_KEY}:`, `${PLANNER_STORAGE_KEY}:%ZZ`, `${PLANNER_STORAGE_KEY}-v2:student-1`,
    `${PLANNER_STORAGE_KEY}:%73tudent-1`, `${PLANNER_STORAGE_KEY}:${LEGACY_PLANNER_OWNER_ID}`,
  ])("does not merge ambiguous or unsupported keys: %s", async (key) => {
    const review = await inspectBackupPlanners([{ key, raw: "[]" }], accounts);
    expect(review.issues).toEqual([expect.objectContaining({ code: "unsupported-planner-key", referenceId: key, level: "error" })]);
    expect(review.checks[0].status).toBe("invalid");
  });

  it("distinguishes missing archived accounts from a proven missing owner", async () => {
    const key = getPlannerStorageKey("student-1");
    expect((await inspectBackupPlanners([{ key, raw: "[]" }])).issues).toContainEqual(expect.objectContaining({ code: "unchecked-planner-owner", level: "review" }));
    expect((await inspectBackupPlanners([{ key, raw: "[]" }], new Set())).issues).toContainEqual(expect.objectContaining({ code: "missing-planner-owner", level: "error" }));
  });

  it("does not require the archived owner to keep the same role or active access", async () => {
    const state = plannerBackupFixture(); state.accounts.accounts[2].role = "teacher"; state.accounts.accounts[2].status = "blocked";
    state.accounts.accounts[2].studentGroupId = undefined; state.accounts.accounts[2].memberships = []; state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.issues.some((issue) => issue.kind === "planners")).toBe(false);
  });

  it("keeps old optional fields omitted and accepts a task without time or with only an end date", async () => {
    const key = getPlannerStorageKey("student-1");
    const notes = [{ id: "old-1", title: "PRIVATE LEGACY", createdAt: "2026-10-29T00:00Z" }, { id: "old-2", title: "PRIVATE END ONLY", createdAt: "2026-10-29T00:00Z", endAt: "2026-10-30T00:00Z" }];
    const raw = JSON.stringify(notes);
    const review = await inspectBackupPlanners([{ key, raw }], accounts);
    expect(review.issues).toEqual([]); expect(review.checks[0]).toMatchObject({ records: 2, status: "valid" });
    expect(JSON.stringify(notes)).toBe(raw);
  });

  it.each([
    { id: "" }, { createdAt: "wrong" }, { title: {} }, { text: [] }, { completed: "true" },
    { priority: "urgent" }, { category: "other" }, { startAt: "wrong" }, { endAt: null },
  ])("reports invalid task fields instead of silently defaulting them: %j", async (change) => {
    const state = plannerBackupFixture(); Object.assign(state.notes[0], change); state.save();
    const review = await inspectBackupPlanners(state.archive.localStorage, accounts);
    expect(review.checks[0].status).toBe("invalid"); expect(review.checks[0]).not.toHaveProperty("records");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "invalid-planner-document", referenceId: state.plannerKey }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it.each(["{PRIVATE BROKEN", "{}", "[null]"])("rejects malformed lists: %s", async (raw) => {
    const review = await inspectBackupPlanners([{ key: getPlannerStorageKey("student-1"), raw }], accounts);
    expect(review.checks[0].status).toBe("invalid"); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("reports a partially damaged list and duplicate IDs without deleting any tasks", async () => {
    const state = plannerBackupFixture(); state.notes.push({ ...state.notes[0] }); state.save(); const before = JSON.stringify(state.archive);
    expect((await inspectBackupPlanners(state.archive.localStorage, accounts)).checks[0].status).toBe("invalid");
    expect(JSON.stringify(state.archive)).toBe(before);
    state.archive.localStorage.find((entry) => entry.key === state.plannerKey)!.raw = JSON.stringify([state.notes[0], null]);
    const beforePartial = JSON.stringify(state.archive);
    const partial = await inspectBackupPlanners(state.archive.localStorage, accounts);
    expect(partial.checks[0]).not.toHaveProperty("records"); expect(partial.checks[0].status).toBe("invalid");
    expect(JSON.stringify(state.archive)).toBe(beforePartial);
  });

  it("keeps separate findings for each invalid time interval in the same list", async () => {
    const state = plannerBackupFixture(); state.notes[0].endAt = state.notes[0].startAt;
    state.notes.push({ ...state.notes[0], id: "note-2", endAt: "2026-10-29T11:00:00.000Z" }); state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    const issues = review.issues.filter((issue) => issue.code === "invalid-planner-interval");
    expect(issues.map((issue) => issue.recordId)).toEqual(["note-1", "note-2"]);
    expect(issues.every((issue) => issue.referenceId === state.plannerKey)).toBe(true);
    expect(review.counts).toMatchObject({ valid: 9, invalid: 0, errors: 2 });
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("accepts multi-day intervals and compares instants with explicit offsets", async () => {
    const state = plannerBackupFixture(); state.notes[0].startAt = "2026-10-29T12:00:00+03:00"; state.notes[0].endAt = "2026-10-30T09:00:00Z"; state.save();
    expect((await inspectBackupPlanners(state.archive.localStorage, accounts)).issues).toEqual([]);
  });

  it("distinguishes absent and empty lists and groups hundreds of lists in one summary", async () => {
    const absent = await inspectBackupPlanners([]);
    expect(absent.checks[0]).toMatchObject({ status: "absent", documents: 0 }); expect(absent.checks[0]).not.toHaveProperty("records");
    const entries = Array.from({ length: 250 }, (_, index) => ({ key: getPlannerStorageKey(`owner-${index}`), raw: "[]" }));
    const owners = new Set(entries.map((entry) => getPlannerStorageOwner(entry.key)!));
    const review = await inspectBackupPlanners(entries, owners);
    expect(review.checks).toHaveLength(1); expect(review.checks[0]).toMatchObject({ status: "valid", documents: 250, records: 0 }); expect(review.issues).toEqual([]);
  });

  it("does not treat planner display preferences as a private task list", async () => {
    const review = await inspectBackupPlanners([{ key: "bi-university-planner-view", raw: "board" }]);
    expect(review.checks[0].status).toBe("absent"); expect(review.issues).toEqual([]);
  });

  it("propagates cancellation between batches without returning a partial report", async () => {
    const controller = new AbortController();
    const entries = Array.from({ length: 260 }, (_, index) => ({ key: getPlannerStorageKey(`owner-${index}`), raw: "[]" }));
    const promise = inspectBackupPlanners(entries, undefined, controller.signal); controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
