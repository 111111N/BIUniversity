import { createMemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { changesAdminAccount, changesAdminSubject, changesAssignmentAnswer, changesAssignmentEditor, changesJournalSection, changesLocation, changesMaterialScope, changesMessageContact, changesPlannerTask, createUnsavedChangesRegistry } from "./unsavedNavigation";

const transition = (current: string, next: string) => {
  const currentLocation = new URL(current, "https://example.test");
  const nextLocation = new URL(next, "https://example.test");
  return { currentLocation, nextLocation };
};

describe("unsaved form navigation", () => {
  it("protects the selected account and mode while keeping registry filters usable", () => {
    const current = "/admin/accounts?account=one&mode=details&type=student";
    expect(changesAdminAccount(transition(current, current + "&q=ivan&group=group-1&page=2"))).toBe(false);
    expect(changesAdminAccount(transition(current, "/admin/accounts?account=one&mode=role"))).toBe(true);
    expect(changesAdminAccount(transition(current, "/admin/accounts?account=two&mode=details"))).toBe(true);
    expect(changesAdminAccount(transition(current, "/admin/accounts?create=student&group=group-1"))).toBe(true);
    expect(changesAdminAccount(transition(current, "/admin/groups"))).toBe(true);
  });
  it("keeps an assignment draft while searching or paging, and protects subject changes", () => {
    const current = "/admin/subjects?subject=math&q=volkova&page=2";
    expect(changesAdminSubject(transition(current, "/admin/subjects?subject=math&q=112&page=1"))).toBe(false);
    expect(changesAdminSubject(transition(current, "/admin/subjects?subject=math&notifications=open"))).toBe(false);
    expect(changesAdminSubject(transition(current, "/admin/subjects?subject=physics"))).toBe(true);
    expect(changesAdminSubject(transition(current, "/admin/subjects"))).toBe(true);
    expect(changesAdminSubject(transition(current, "/admin/accounts"))).toBe(true);
    expect(changesAdminSubject(transition(current, current + "&teacher=one"))).toBe(true);
    expect(changesAdminSubject(transition(current + "&teacher=one", current + "&teacher=two"))).toBe(true);
  });
  it("protects uploads when changing the effective material scope, without blocking equivalent group URLs or filters", () => {
    const current = "/journal/math/group?tab=materials";
    expect(changesMaterialScope(transition(current, current + "&materials=group"))).toBe(false);
    expect(changesMaterialScope(transition(current, current + "&fileQ=notes"))).toBe(false);
    expect(changesMaterialScope(transition(current, current + "&materials=subject"))).toBe(true);
    expect(changesMaterialScope(transition(current + "&materials=subject", current))).toBe(true);
    expect(changesMaterialScope(transition(current, "/journal/math/group?tab=journal"))).toBe(true);
  });
  it("protects the standalone editor when returning to the list or changing the edited assignment", () => {
    expect(changesAssignmentEditor(transition("/journal/math/group?tab=assignments&editor=new", "/journal/math/group?tab=assignments"))).toBe(true);
    expect(changesAssignmentEditor(transition("/journal/math/group?tab=assignments&assignment=one&editor=edit", "/journal/math/group?tab=assignments&assignment=two&editor=edit"))).toBe(true);
    expect(changesAssignmentEditor(transition("/journal/math/group?tab=assignments&editor=new", "/journal/math/group?tab=assignments&editor=new&notifications=open"))).toBe(false);
  });
  it("protects journal tab changes while keeping assignment selection and notification controls usable", () => {
    const current = "/journal/math/group?tab=assignments&assignment=one";
    expect(changesJournalSection(transition(current, "/journal/math/group?tab=materials"))).toBe(true);
    expect(changesJournalSection(transition(current, "/journal/math/group?assignment=two&submission=answer"))).toBe(false);
    expect(changesJournalSection(transition(current, current + "&notifications=open"))).toBe(false);
    expect(changesJournalSection(transition(current, "/journal/math/another?tab=assignments"))).toBe(true);
  });

  it("protects files in the answer when collapsing or selecting a different assignment", () => {
    const current = "/journal/math/group?tab=assignments&assignment=one";
    expect(changesAssignmentAnswer(transition(current, "/journal/math/group?tab=assignments"))).toBe(true);
    expect(changesAssignmentAnswer(transition(current, "/journal/math/group?tab=assignments&assignment=two"))).toBe(true);
    expect(changesAssignmentAnswer(transition(current, current + "&notifications=open"))).toBe(false);
  });

  it("protects message composer remounts and respects the legacy contact query", () => {
    expect(changesMessageContact(transition("/messages?contact=anna", "/messages?contact=ivan"))).toBe(true);
    expect(changesMessageContact(transition("/messages?contact=anna", "/messages?student=anna"))).toBe(false);
    expect(changesMessageContact(transition("/messages?contact=anna", "/messages?contact=anna&notifications=open"))).toBe(false);
  });

  it("does not block the planner URL cleanup after saving or confirmed dismissal", () => {
    expect(changesPlannerTask(transition("/planner?task=one", "/planner?date=2026-10-20"))).toBe(false);
    expect(changesPlannerTask(transition("/planner?task=one", "/planner?task=two"))).toBe(true);
    expect(changesPlannerTask(transition("/planner?task=one", "/schedule"))).toBe(true);
  });

  it("keeps independent dirty forms registered until each is saved or unmounted", () => {
    const registry = createUnsavedChangesRegistry();
    const removeFirst = registry.register(changesLocation);
    const removeSecond = registry.register(changesLocation);
    removeFirst();
    removeFirst();
    expect(registry.shouldBlock(transition("/journal", "/schedule"))).toBe(true);
    expect(registry.blocksAction()).toBe(true);
    removeSecond();
    expect(registry.hasChanges()).toBe(false);
    expect(registry.blocksAction()).toBe(false);
    expect(registry.shouldBlock(transition("/journal", "/schedule"))).toBe(false);
  });

  it("warns about closing a tab with a session draft without blocking safe SPA or role changes", () => {
    const registry = createUnsavedChangesRegistry();
    registry.register(() => false, false);
    expect(registry.hasChanges()).toBe(true);
    expect(registry.blocksAction()).toBe(false);
    expect(registry.shouldBlock(transition("/journal", "/schedule"))).toBe(false);
  });

  it("keeps the form safe and reports errors if a guard fails", () => {
    const registry = createUnsavedChangesRegistry();
    const error = new Error("guard failed");
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      registry.register(() => { throw error; });
      expect(registry.shouldBlock(transition("/journal", "/schedule"))).toBe(true);
      expect(report).toHaveBeenCalledWith(expect.stringContaining("несохранённые изменения"), error);
    } finally { report.mockRestore(); }
  });

  it("cancels an attempted route change and proceeds to the exact confirmed URL", async () => {
    const registry = createUnsavedChangesRegistry();
    const remove = registry.register(changesLocation);
    const router = createMemoryRouter([{ path: "*", element: null }], { initialEntries: ["/journal?tab=assignments"] });
    try {
      router.getBlocker("unsaved", registry.shouldBlock);
      await router.navigate("/schedule?date=2026-10-26#lesson");
      expect(router.state.location.pathname).toBe("/journal");
      let blocker = router.state.blockers.get("unsaved")!;
      expect(blocker.state).toBe("blocked");
      if (blocker.state !== "blocked") throw new Error("Expected a blocked navigation");
      blocker.reset();
      expect(router.state.location.search).toBe("?tab=assignments");
      await router.navigate("/journal?tab=materials");
      blocker = router.state.blockers.get("unsaved")!;
      if (blocker.state !== "blocked") throw new Error("Expected a blocked tab change");
      blocker.proceed();
      await Promise.resolve();
      expect(router.state.location.pathname + router.state.location.search).toBe("/journal?tab=materials");
      remove();
      await router.navigate("/schedule?date=2026-10-26#lesson");
      expect(router.state.location.pathname + router.state.location.search + router.state.location.hash).toBe("/schedule?date=2026-10-26#lesson");
      expect(router.state.blockers.get("unsaved")?.state).toBe("unblocked");
    } finally { router.dispose(); }
  });

  it("protects browser Back and removes the block after a form is saved", async () => {
    const registry = createUnsavedChangesRegistry();
    const remove = registry.register(changesLocation);
    const router = createMemoryRouter([{ path: "*", element: null }], { initialEntries: ["/schedule?date=2026-10-19", "/journal?tab=assignments"] });
    try {
      router.getBlocker("unsaved", registry.shouldBlock);
      await router.navigate(-1);
      const blocker = router.state.blockers.get("unsaved")!;
      expect(router.state.location.pathname).toBe("/journal");
      if (blocker.state !== "blocked") throw new Error("Expected a blocked Back navigation");
      blocker.reset();
      remove();
      await router.navigate(-1);
      expect(router.state.location.pathname + router.state.location.search).toBe("/schedule?date=2026-10-19");
      expect(registry.hasChanges()).toBe(false);
    } finally { router.dispose(); }
  });
});
