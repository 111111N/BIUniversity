import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKUP_CORE_DOCUMENTS, BACKUP_LEARNING_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";
import { inspectBackupNotifications } from "./backupNotificationDocuments";
import { createArchivedNotificationTargetCheck } from "./backupNotificationTargets";
import { notificationTargetBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Target checks must not navigate, infer demo records or access live data"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); vi.stubGlobal("open", forbidden); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const targetIssues = (review: Awaited<ReturnType<typeof inspectBackupDocuments>>) => review.issues.filter((issue) => issue.kind === "notifications");
const sources = (state: ReturnType<typeof notificationTargetBackupFixture>) => ({ assignments: state.assignments, submissions: state.submissions, subjectIds: new Set(state.subjects.subjects.map((subject) => subject.id)), groupIds: new Set(state.groups.groups.map((group) => group.id)) });
const inspect = async (href: string, state = notificationTargetBackupFixture()) => {
  const findings: { level: string; code: string }[] = []; const check = await createArchivedNotificationTargetCheck(sources(state));
  check.inspect(href, (level, code) => findings.push({ level, code })); return { findings, summary: check.summary() };
};

describe("archived notification targets", () => {
  it("matches the saved assignment, answer and exact academic area without claiming recipient rights", async () => {
    const state = notificationTargetBackupFixture(); const before = JSON.stringify(state.archive);
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.counts).toMatchObject({ valid: 10, invalid: 0, errors: 0, reviews: 0 });
    expect(result.checks.find((check) => check.kind === "notifications")!.message).toContain("Целей заданий и ответов: 1; сопоставлено: 1; не подтверждено: 0; ссылок вне этой сверки: 0");
    expect(result.checks.find((check) => check.kind === "notifications")!.message).toContain("а не права получателя");
    expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(JSON.stringify(result)).not.toContain("assignment="); expect(JSON.stringify(state.archive)).toBe(before);
  });

  it("accepts assignment-only targets and does not infer a required answer from the notification kind", async () => {
    const result = await inspect("/journal/subject-1/group-1?assignment=task-1"); expect(result.findings).toEqual([]); expect(result.summary).toContain("сопоставлено: 1");
  });

  it("decodes path and query components once and preserves literal plus, colon, Unicode and percent in query IDs", async () => {
    const state = notificationTargetBackupFixture(); state.assignments[0].id = "task +:%2F"; state.submissions[0].assignmentId = state.assignments[0].id;
    state.assignments[0].subjectId = "дисциплина:1"; state.subjects.subjects[0].id = "дисциплина:1";
    state.assignments[0].groupId = "группа:1"; state.groups.groups[0].id = "группа:1";
    const href = `/journal/${encodeURIComponent("дисциплина:1")}/${encodeURIComponent("группа:1")}?${new URLSearchParams({ assignment: state.assignments[0].id, submission: "answer-1", tab: "assignments" })}`;
    expect((await inspect(href, state)).findings).toEqual([]);
  });

  it.each([
    "/journal/subject-1/group-1?assignment=task-1&assignment=task-1",
    "/journal/subject-1/group-1?assignment=task-1&submission=answer-1&submission=other",
    "/journal/subject-1/group-1?assignment=task-1&tab=assignments&tab=journal",
    "/journal/subject-1/group-1?submission=answer-1",
    "/journal/subject-1/group-1?assignment=",
    "/journal/subject-1/group-1?assignment=task-1&submission=",
    "/journal/subject-1/group-1?assignment=task-1&tab=journal",
    "/journal/subject-1/group-1?assignment=task-1&tab=materials",
    "/journal/subject-1/group-1?assignment=task-1&tab=history",
    "/journal/subject-1/group-1?assignment=%FF",
    "/journal/%/group-1?assignment=task-1",
    "/journal/subject-1/group-1?assignment=task-%",
    "/journal/%252F/group-1?assignment=task-1",
    "/journal/subject-1%2Fother/group-1?assignment=task-1",
    "/journal/../group-1?assignment=task-1",
    "/journal/subject-1?assignment=task-1",
    "/schedule?assignment=task-1",
    "/BIUniversity/journal/subject-1/group-1?assignment=task-1",
  ])("does not normalize or pick a target from an ambiguous address: %s", async (href) => {
    const result = await inspect(href); expect(result.findings).toEqual([{ level: "review", code: "ambiguous-notification-target" }]);
    expect(result.summary).toContain("сопоставлено: 0; не подтверждено: 1");
  });

  it("keeps hash fragments and unrelated filters outside target identity", async () => {
    expect((await inspect("/journal/subject-1/group-1?assignment=task-1&assignmentTab=answers&q=PRIVATE#PRIVATE")).findings).toEqual([]);
    expect((await inspect("/journal/subject-1/group-1?assignment=task-1&q=%FF")).findings).toEqual([]);
    expect((await inspect("/journal/subject-1/group-1?assignment=task-1&tab=unknown")).findings).toEqual([]);
  });

  it("reports a missing assignment as review because a retained notification can outlive a deleted target", async () => {
    const state = notificationTargetBackupFixture(); state.notifications[0].href = "/journal/subject-1/group-1?assignment=PRIVATE-MISSING"; state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(targetIssues(result)).toEqual([expect.objectContaining({ level: "review", code: "missing-notification-assignment", recordId: "notice-1" })]);
    expect(result.checks.find((check) => check.kind === "notifications")!.status).toBe("valid"); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("reports a missing answer without selecting another answer for the same assignment or student", async () => {
    const state = notificationTargetBackupFixture(); state.submissions[0].id = "another-answer"; state.save();
    expect(targetIssues(await inspectBackupDocuments(state.archive, "configurator-demo"))).toEqual([expect.objectContaining({ level: "review", code: "missing-notification-submission", recordId: "notice-1" })]);
  });

  it("reports a positively conflicting assignment area as error", async () => {
    const state = notificationTargetBackupFixture(); state.groups.groups.push({ ...state.groups.groups[0], id: "group-2", name: "102" });
    state.notifications[0].href = state.notifications[0].href.replace("group-1?", "group-2?"); state.save();
    expect(targetIssues(await inspectBackupDocuments(state.archive, "configurator-demo"))).toEqual([expect.objectContaining({ level: "error", code: "notification-target-area-conflict" })]);
  });

  it("checks the answer's exact assignment ID even when both records exist", async () => {
    const state = notificationTargetBackupFixture(); state.assignments.push({ ...state.assignments[0], id: "task-2" }); state.submissions[0].assignmentId = "task-2"; state.save();
    expect(targetIssues(await inspectBackupDocuments(state.archive, "configurator-demo"))).toEqual([expect.objectContaining({ level: "error", code: "notification-target-submission-conflict" })]);
  });

  it.each(["assignments", "submissions"] as const)("distinguishes unreadable %s from a readable empty source without using a valid subset", async (kind) => {
    const state = notificationTargetBackupFixture();
    state.archive.localStorage.find((entry) => entry.key === BACKUP_LEARNING_DOCUMENTS[kind].key)!.raw = JSON.stringify([...(kind === "assignments" ? state.assignments : state.submissions), null]);
    expect(targetIssues(await inspectBackupDocuments(state.archive, "configurator-demo"))).toContainEqual(expect.objectContaining({ level: "review", code: `unchecked-notification-${kind === "assignments" ? "assignment" : "submission"}` }));
    state.archive.localStorage.find((entry) => entry.key === BACKUP_LEARNING_DOCUMENTS[kind].key)!.raw = "[]";
    expect(targetIssues(await inspectBackupDocuments(state.archive, "configurator-demo"))).toContainEqual(expect.objectContaining({ level: "review", code: `missing-notification-${kind === "assignments" ? "assignment" : "submission"}` }));
  });

  it("does not fill old assignment IDs from names or current account memberships", async () => {
    const state = notificationTargetBackupFixture(); const legacy: Partial<(typeof state.assignments)[number]> = state.assignments[0];
    delete legacy.subjectId; delete legacy.groupId; state.save();
    expect(targetIssues(await inspectBackupDocuments(state.archive, "configurator-demo"))).toEqual([expect.objectContaining({ level: "review", code: "legacy-notification-target-area" })]);
  });

  it("does not use baseline groups in place of saved target catalogs", async () => {
    const state = notificationTargetBackupFixture(); state.groups.groups = []; state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo", { groupIds: ["group-1"], requiredSubjectIds: [] });
    expect(targetIssues(result)).toEqual([expect.objectContaining({ level: "review", code: "missing-notification-target-area" })]);
    state.archive.localStorage = state.archive.localStorage.filter((entry) => entry.key !== BACKUP_CORE_DOCUMENTS.groups.key);
    expect(targetIssues(await inspectBackupDocuments(state.archive, "configurator-demo"))).toEqual([expect.objectContaining({ level: "review", code: "unchecked-notification-target-catalogs" })]);
  });

  it("does not turn a matching target into evidence of current or historical recipient access", async () => {
    const state = notificationTargetBackupFixture(); state.notifications[0].recipientUserId = "configurator-demo"; state.accounts.accounts[1].memberships = []; state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo"); expect(targetIssues(result)).toEqual([]);
    expect(result.checks.find((check) => check.kind === "notifications")!.message).toContain("а не права получателя или доступность на дату уведомления");
  });

  it("leaves section links outside this check and never opens or derives a record from them", async () => {
    for (const href of ["/schedule?date=2026-10-29", "/schedule?tab=one&tab=two", "/schedule?tab=%FF", "/journal", "/students/student-1"]) {
      const result = await inspect(href); expect(result.findings).toEqual([]); expect(result.summary).toContain("Целей заданий и ответов: 0"); expect(result.summary).toContain("ссылок вне этой сверки: 1");
    }
  });

  it.each(["/journal/subject-1", "/journal/subject-1/group-1", "/journal/subject-1/group-1?tab=journal", "/journal/subject-1/group-1?tab=materials&q=%FF", "/journal/subject-1/group-1#assignment=task-1"])("matches catalog area IDs without implying that journal data or permissions exist: %s", async (href) => {
    const result = await inspect(href);
    expect(result.findings).toEqual([]); expect(result.summary).toContain("Целей заданий и ответов: 0");
    expect(result.summary).toContain("Учебных областей ссылок журнала: 1; сопоставлено: 1; не подтверждено: 0");
    expect(result.summary).toContain("Наличие области в каталогах не подтверждает содержимое журнала, оценки или материалы");
  });

  it("requires only the subject catalog for a subject-wide route", async () => {
    const check = await createArchivedNotificationTargetCheck({ subjectIds: new Set(["subject-1"]) });
    const finding = vi.fn(); check.inspect("/journal/subject-1", finding);
    expect(finding).not.toHaveBeenCalled(); expect(check.summary()).toContain("Учебных областей ссылок журнала: 1; сопоставлено: 1");
    check.inspect("/journal/subject-1/group-1", finding);
    expect(finding).toHaveBeenCalledWith("review", "unchecked-notification-target-catalogs", expect.any(String));
  });

  it.each(["/journal/gone/group-1", "/journal/subject-1/gone", "/journal/gone"])("keeps a missing catalog ID unresolved without substituting a similarly named record: %s", async (href) => {
    const result = await inspect(href);
    expect(result.findings).toEqual([{ level: "review", code: "missing-notification-target-area" }]);
    expect(result.summary).toContain("Учебных областей ссылок журнала: 1; сопоставлено: 0; не подтверждено: 1");
  });

  it.each(["/journal/", "/journal/subject-1/", "/journal/subject-1/group-1/extra", "/journal/%FF/group-1", "/journal/subject-1/%252F", "/journal/../group-1", "/journal/subject-1%2Fother/group-1", "/journal/subject-1/group-1?tab=journal&tab=materials", "/journal/subject-1/group-1?tab=%FF"])("does not normalize an ambiguous journal-area route: %s", async (href) => {
    const result = await inspect(href);
    expect(result.findings).toEqual([{ level: "review", code: "ambiguous-notification-area-target" }]);
    expect(result.summary).toContain("Учебных областей ссылок журнала: 1; сопоставлено: 0; не подтверждено: 1");
  });

  it("preserves Unicode, colon and literal plus in path IDs instead of applying query decoding", async () => {
    const state = notificationTargetBackupFixture(); state.subjects.subjects[0].id = "дисциплина:+1"; state.groups.groups[0].id = "группа:+1";
    expect((await inspect(`/journal/${encodeURIComponent("дисциплина:+1")}/${encodeURIComponent("группа:+1")}`, state)).findings).toEqual([]);
    expect((await inspect("/journal/дисциплина:+1/группа:+1", state)).findings).toEqual([]);
  });

  it.each(["subjects", "groups"] as const)("uses only the fully decoded archived %s catalog for an area target", async (kind) => {
    const state = notificationTargetBackupFixture(); state.notifications[0].href = "/journal/subject-1/group-1"; state.save();
    const entry = state.archive.localStorage.find((row) => row.key === BACKUP_CORE_DOCUMENTS[kind].key)!;
    entry.raw = "null";
    expect(targetIssues(await inspectBackupDocuments(state.archive, "configurator-demo"))).toEqual([expect.objectContaining({ code: "unchecked-notification-target-catalogs", recordId: "notice-1" })]);
    state.archive.localStorage = state.archive.localStorage.filter((row) => row !== entry);
    expect(targetIssues(await inspectBackupDocuments(state.archive, "configurator-demo", { groupIds: ["group-1"], requiredSubjectIds: [] }))).toEqual([expect.objectContaining({ code: "unchecked-notification-target-catalogs" })]);
  });

  it("retains area findings for legacy rows without inventing a recipient or permanent ID", async () => {
    const state = notificationTargetBackupFixture();
    const result = await inspectBackupNotifications([{ key: state.notificationKey, raw: JSON.stringify([{ kind: "grade", title: "PRIVATE", createdAt: "2026-10-29T00:00:00Z", recipientRole: "student", href: "/journal/subject-1/gone" }]) }], undefined, undefined, sources(state));
    expect(result.issues.map((issue) => issue.code)).toEqual(["legacy-notification-id-row-1", "legacy-notification-recipient-row-1", "missing-notification-target-area-row-1"]);
    expect(result.issues.every((issue) => issue.recordId === undefined)).toBe(true); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("does not repeat a target finding for an already unsafe link or inspect partial invalid notification lists", async () => {
    const state = notificationTargetBackupFixture(); state.notifications[0].href = "//PRIVATE?assignment=task-1"; state.save();
    expect(targetIssues(await inspectBackupDocuments(state.archive, "configurator-demo"))).toEqual([expect.objectContaining({ code: "invalid-notification-link" })]);
    state.archive.localStorage.find((entry) => entry.key === state.notificationKey)!.raw = JSON.stringify({ version: 2, items: [state.notifications[0], null] });
    expect(targetIssues(await inspectBackupDocuments(state.archive, "configurator-demo"))).toEqual([expect.objectContaining({ code: "invalid-notification-document" })]);
  });

  it("retains independent target findings for legacy rows without assigning permanent IDs or recipients", async () => {
    const state = notificationTargetBackupFixture(); const { id: _id, recipientUserId: _recipient, ...old } = state.notifications[0]; void _id; void _recipient;
    const raw = JSON.stringify([{ ...old, href: "/journal/subject-1/group-1?assignment=gone", recipientRole: "student" }]);
    const result = await inspectBackupNotifications([{ key: state.notificationKey, raw }], undefined, undefined, sources(state));
    expect(result.issues.map((issue) => issue.code)).toEqual(["legacy-notification-id-row-1", "legacy-notification-recipient-row-1", "missing-notification-assignment-row-1"]);
    expect(result.issues.every((issue) => issue.recordId === undefined)).toBe(true);
  });

  it("keeps all findings beyond 200 and cancels index building without returning a partial review", async () => {
    const state = notificationTargetBackupFixture(); state.notifications.splice(0, 1, ...Array.from({ length: 205 }, (_, index) => ({ ...state.notifications[0], id: `notice-${index}`, href: `/journal/subject-1/group-1?assignment=PRIVATE-${index}` }))); state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo"); expect(targetIssues(result)).toHaveLength(205);
    expect(targetIssues(result).at(-1)).toMatchObject({ code: "missing-notification-assignment", recordId: "notice-204" }); expect(JSON.stringify(result)).not.toContain("PRIVATE");
    const controller = new AbortController(); const pending = createArchivedNotificationTargetCheck({ ...sources(state), assignments: Array.from({ length: 1000 }, (_, index) => ({ ...state.assignments[0], id: `task-${index}` })) }, controller.signal);
    setTimeout(() => controller.abort(), 0); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const stopped = new AbortController(); stopped.abort(); await expect(createArchivedNotificationTargetCheck({}, stopped.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
