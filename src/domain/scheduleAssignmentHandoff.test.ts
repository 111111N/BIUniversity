import { createMemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createScheduleAssignmentHandoff, type ScheduleAssignmentDraft } from "./scheduleAssignmentHandoff";
import { changesAdminSubject, changesLocation, createUnsavedChangesRegistry } from "./unsavedNavigation";
import type { ManagedLesson } from "./scheduleManagement";
import { resolveScheduleEditingScope } from "./scheduleEditing";

const lesson: ManagedLesson = { id: "managed:one", scheduleId: 101, subjectId: "math", groupId: "group", teacherId: "", teacherName: "", date: "2026-10-27", startsAt: "09:00", endsAt: "", room: " Введённая аудитория ", type: "lecture" };
const draft = (): ScheduleAssignmentDraft => ({
  weekStart: "2026-10-26", groupId: "group", historySearch: "", returnSearch: "group=group&date=2026-10-26",
  lessons: [{ ...lesson, id: "managed:other", scheduleId: 102, room: "Правки другой пары" }],
  saved: "[]", revision: 7, editor: { ...lesson }, editorBase: JSON.stringify({ ...lesson, room: "" }),
  removedLesson: { ...lesson, id: "managed:removed", scheduleId: 103 },
});
const transition = (current: string, next: string) => ({ currentLocation: new URL(current, "https://example.test"), nextLocation: new URL(next, "https://example.test") });

describe("assignment handoff for an unfinished schedule lesson", () => {
  it("retains incomplete fields, week edits, baseline, revision and undo without modifying source objects", () => {
    const store = createScheduleAssignmentHandoff();
    const input = draft();
    const target = store.begin(input, "one");
    expect(target).toBe("/admin/subjects?subject=math&scheduleReturn=one");
    input.editor.room = "Changed later"; input.lessons[0].room = "Changed later";
    const restored = store.readSchedule("date=2026-10-26&scheduleReturn=one&group=group", "2026-10-26", "group")!;
    expect(restored).toEqual({ ...draft(), token: "one" });
    restored.editor.room = "Changed copy"; restored.lessons.length = 0;
    expect(store.readSchedule("", "2026-10-26", "group")?.editor.room).toBe(lesson.room);
    expect(store.readSchedule("", "2026-10-26", "group")?.lessons).toHaveLength(1);
  });
  it("restores browser Back to the original default scope as well as the explicit return URL", () => {
    const store = createScheduleAssignmentHandoff(); store.begin(draft(), "one");
    expect(store.readSchedule("", "2026-10-26", "group")).not.toBeNull();
    expect(store.returnUrl()).toBe("/admin/schedule?group=group&date=2026-10-26&scheduleReturn=one");
    expect(store.readSchedule("group=group&date=2026-10-26&scheduleReturn=one", "2026-10-26", "group")).not.toBeNull();
  });
  it("opens the selected teacher when the unfinished lesson already has one", () => {
    const store = createScheduleAssignmentHandoff(); const input = draft();
    input.editor.teacherId = "teacher & one";
    const target = new URL(store.begin(input, "one"), "https://example.test");
    expect(target.searchParams.get("teacher")).toBe("teacher & one");
    expect(store.readSubjects(target.search)?.editor.teacherId).toBe("teacher & one");
  });
  it("keeps the original default scope after the date or default group changes, without replacing explicit invalid parameters", () => {
    const store = createScheduleAssignmentHandoff(); store.begin(draft(), "one");
    const opening = store.getOpeningScope("");
    expect(resolveScheduleEditingScope(opening.group, opening.date, [{ id: "new-default" }, { id: "group" }], "2026-11-02")).toMatchObject({ groupId: "group", weekStart: "2026-10-26", valid: true });
    expect(store.getOpeningScope("group=&date=bad")).toEqual({ group: "", date: "bad" });
    expect(store.getOpeningScope("scheduleReturn=old")).toEqual({ group: null, date: null });
  });
  it.each([
    ["group=other&date=2026-10-26&scheduleReturn=one", "2026-10-26", "other"],
    ["group=group&date=2026-11-02&scheduleReturn=one", "2026-11-02", "group"],
    ["group=group&date=2026-10-26&scheduleReturn=old", "2026-10-26", "group"],
    ["", "2026-11-02", "group"],
    ["", "2026-10-26", "other"],
  ])("never restores a different scope or stale token: %s", (search, week, group) => {
    const store = createScheduleAssignmentHandoff(); store.begin(draft(), "one");
    expect(store.readSchedule(search, week, group)).toBeNull();
  });
  it("does not expose or restore another provider's input, or input after a reload", () => {
    const first = createScheduleAssignmentHandoff(); first.begin(draft(), "one");
    const otherUserOrReload = createScheduleAssignmentHandoff();
    expect(otherUserOrReload.readSubjects("subject=math&scheduleReturn=one")).toBeNull();
    expect(otherUserOrReload.readSchedule("group=group&date=2026-10-26&scheduleReturn=one", "2026-10-26", "group")).toBeNull();
    expect(otherUserOrReload.returnUrl()).toBeNull();
    first.clear(); expect(first.getSnapshot()).toBeNull();
  });
  it("keeps other pages and invalid handoff tokens protected, while allowing assignment search and paging", () => {
    const store = createScheduleAssignmentHandoff(); const target = store.begin(draft(), "one");
    expect(store.permitsAssignmentNavigation(transition("/admin/schedule", target))).toBe(true);
    expect(store.permitsAssignmentNavigation(transition("/admin/schedule", "/admin/subjects?subject=math"))).toBe(false);
    expect(store.shouldBlock(transition(target, target + "&q=Иван&page=2"))).toBe(false);
    for (const next of ["/admin/accounts", "/admin/subjects?subject=math&scheduleReturn=old", "/admin/schedule?group=other&date=2026-10-26"]) {
      expect(store.shouldBlock(transition(target, next))).toBe(true);
    }
    expect(store.returnUrl()).not.toContain("https:");
  });
  it("keeps the suspended input guarded through the round trip, and requires saving or discarding edited assignments", async () => {
    const store = createScheduleAssignmentHandoff(); const registry = createUnsavedChangesRegistry();
    const input = draft();
    const router = createMemoryRouter([{ path: "*", element: null }], { initialEntries: ["/admin/schedule"] });
    const unregisterLesson = registry.register((change) => changesLocation(change) && !store.permitsAssignmentNavigation(change));
    try {
      router.getBlocker("unsaved", registry.shouldBlock);
      await router.navigate("/admin/subjects?subject=math");
      expect(router.state.blockers.get("unsaved")?.state).toBe("blocked");
      const blocked = router.state.blockers.get("unsaved")!;
      if (blocked.state !== "blocked") throw new Error("Expected a blocked ordinary transition");
      blocked.reset();
      const target = store.begin(input, "one");
      const unregisterSuspended = registry.register(store.shouldBlock);
      await router.navigate(target); unregisterLesson();
      expect(router.state.location.pathname).toBe("/admin/subjects");
      expect(registry.blocksAction()).toBe(true);
      const unregisterAssignments = registry.register(changesAdminSubject);
      await router.navigate(store.returnUrl()!);
      expect(router.state.blockers.get("unsaved")?.state).toBe("blocked");
      const blockedReturn = router.state.blockers.get("unsaved")!;
      if (blockedReturn.state !== "blocked") throw new Error("Expected an assignment guard");
      blockedReturn.reset(); unregisterAssignments();
      await router.navigate(-1);
      expect(router.state.location.pathname).toBe("/admin/schedule");
      expect(store.readSchedule(router.state.location.search, input.weekStart, input.groupId)).toMatchObject({ revision: 7, saved: "[]", editor: lesson });
      store.clear(); unregisterSuspended(); expect(registry.hasChanges()).toBe(false);
    } finally { router.dispose(); }
  });
});
