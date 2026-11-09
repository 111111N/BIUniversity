import { describe, expect, it } from "vitest";
import type { PortalAccount } from "./accounts";
import type { AssessmentAttemptDraft, AssessmentCommand, AssessmentDocument, AssessmentDraft, AssessmentResult } from "./assessmentTypes";
import { applyAssessmentCommand, assessmentStartsAt, canRecordAssessmentResults, decodeAssessmentDocument, emptyAssessmentDocument, projectAssessments, type AssessmentDomainContext } from "./assessments";

const account = (id: string, role: PortalAccount["role"], extra: Partial<PortalAccount> = {}): PortalAccount => ({ id, role, login: id, name: `Имя ${id}`, revision: 1, status: "active", memberships: [], ...extra });
const config = account("config", "configurator");
const teacher = account("teacher", "teacher");
const student = account("student", "student", { studentGroupId: "group" });
const other = account("other", "student", { studentGroupId: "group", status: "blocked" });
const context = (): AssessmentDomainContext => ({ accounts: [config, teacher, student, other, account("chair", "teacher"), account("member", "teacher"), account("stranger", "teacher")], accountsRevision: 3, groups: [{ id: "group", name: "Группа" }], groupRevision: 2, subjects: [{ id: "subject", name: "Дисциплина" }], subjectRevision: 4 });
const attemptDraft = (patch: Partial<AssessmentAttemptDraft> = {}): AssessmentAttemptDraft => ({ date: "2026-11-06", startsAt: "09:00", room: "A-101", teacherId: teacher.id, studentIds: [student.id, other.id], chairId: null, memberIds: [], ...patch });
const draft = (patch: Partial<AssessmentDraft> = {}): AssessmentDraft => ({ title: "Экзамен по дисциплине", kind: "exam", subjectId: "subject", groupId: "group", period: "Осень 2026", attempt: attemptDraft(), ...patch });
type Payload = { [K in AssessmentCommand["type"]]: Omit<Extract<AssessmentCommand, { type: K }>, "actorId" | "actorRevision" | "expectedRevision" | "accountsRevision" | "groupRevision" | "subjectRevision"> }[AssessmentCommand["type"]];
const execute = (state: AssessmentDocument, payload: Payload, actor = config, domain = context(), occurredAt = "2026-11-06T10:00:00.000Z") => applyAssessmentCommand(state, { ...payload, actorId: actor.id, actorRevision: actor.revision, expectedRevision: state.revision, accountsRevision: domain.accountsRevision, groupRevision: domain.groupRevision, subjectRevision: domain.subjectRevision }, domain, { assessmentId: `assessment-${state.revision}`, attemptId: `attempt-${state.revision}`, historyId: `history-${state.revision}`, occurredAt });
const create = (patch: Partial<AssessmentDraft> = {}, domain = context()) => execute(emptyAssessmentDocument(), { type: "create", draft: draft(patch) }, config, domain);
const marks = (first: AssessmentResult["outcome"] = { status: "graded", grade: 5 }): AssessmentResult[] => [{ studentId: student.id, outcome: first }, { studentId: other.id, outcome: { status: "absent" } }];
const save = (state: AssessmentDocument, results = marks(), actor = teacher) => execute(state, { type: "save-results", assessmentId: state.assessments[0].id, attemptId: state.assessments[0].attempts.at(-1)!.id, results }, actor);
const publish = (state: AssessmentDocument, at?: string) => execute(state, { type: "publish", assessmentId: state.assessments[0].id, attemptId: state.assessments[0].attempts.at(-1)!.id }, teacher, context(), at);
const published = () => publish(save(create()));
const add = (state = published(), kind: "retake" | "commission" = "retake", patch: Partial<AssessmentAttemptDraft> = {}) => execute(state, { type: "add-attempt", assessmentId: state.assessments[0].id, kind, draft: attemptDraft({ studentIds: [student.id], ...patch }) });
const corrupt = (state: AssessmentDocument, mutate: (state: AssessmentDocument) => void) => { const changed = structuredClone(state); mutate(changed); return () => decodeAssessmentDocument(JSON.stringify(changed)); };

describe("assessment commands", () => {
  it("starts with a strict empty document", () => { expect(decodeAssessmentDocument(JSON.stringify(emptyAssessmentDocument()))).toEqual(emptyAssessmentDocument()); });
  it("snapshots an explicit roster and includes blocked students who still study", () => {
    const state = create();
    expect(state.assessments[0].roster.map((row) => row.studentId)).toEqual(["student", "other"]);
    expect(state.assessments[0].attempts[0].state).toBe("draft");
    expect(state.history[0]).toMatchObject({ action: "created", results: null });
    const subset = create({ attempt: attemptDraft({ studentIds: [other.id] }) });
    expect(subset.assessments[0].roster).toHaveLength(1);
  });
  it("does not mutate input state, command arrays, or previous audit snapshots", () => {
    const before = create(); const snapshot = structuredClone(before); const rows = marks();
    const changed = save(before, rows); rows[0].outcome = null;
    expect(before).toEqual(snapshot); expect(changed.assessments[0].attempts[0].results[0].outcome).toEqual({ status: "graded", grade: 5 });
    const second = save(changed, marks({ status: "graded", grade: 2 }));
    expect(second.history[1].results![0].outcome).toEqual({ status: "graded", grade: 5 });
  });
  it.each(["graduated", "expelled", "academicLeave"])("rejects a non-studying student: %s", (enrollmentStatus) => {
    const domain = context(); domain.accounts[2] = { ...student, enrollmentStatus: enrollmentStatus as PortalAccount["enrollmentStatus"] };
    expect(() => create({}, domain)).toThrow();
  });
  it("rejects a different group and an archived group", () => {
    const domain = context(); domain.accounts[2] = { ...student, studentGroupId: "elsewhere" };
    expect(() => create({}, domain)).toThrow(); domain.groups[0].status = "archived";
    expect(() => create({ attempt: attemptDraft({ studentIds: [other.id] }) }, domain)).toThrow();
  });
  it.each(["exam", "pass", "gradedPass"] as const)("requires a subject for %s", (kind) => { expect(() => create({ kind, subjectId: null })).toThrow(); });
  it.each(["internship", "thesis", "coursework"] as const)("allows independent %s without inventing a subject", (kind) => { expect(create({ kind, subjectId: null }).assessments[0].subjectName).toBeNull(); });
  it("rejects students and teachers creating assessments and configurators grading", () => {
    expect(() => execute(emptyAssessmentDocument(), { type: "create", draft: draft() }, teacher)).toThrow();
    expect(() => execute(emptyAssessmentDocument(), { type: "create", draft: draft() }, student)).toThrow();
    expect(() => save(create(), marks(), config)).toThrow();
  });
  it("only the appointed active teacher may save results", () => {
    expect(() => save(create(), marks(), account("stranger", "teacher"))).toThrow();
    const state = create(); const domain = context(); domain.accounts[1] = { ...teacher, status: "blocked" };
    expect(() => execute(state, { type: "save-results", assessmentId: state.assessments[0].id, attemptId: "attempt-0", results: marks() }, teacher, domain)).toThrow();
  });
  it.each(["expectedRevision", "accountsRevision", "groupRevision", "subjectRevision", "actorRevision"] as const)("rejects a stale %s", (field) => {
    const state = create(); const domain = context();
    const command: AssessmentCommand = { type: "save-results", assessmentId: "assessment-0", attemptId: "attempt-0", results: marks(), actorId: teacher.id, actorRevision: 1, expectedRevision: 1, accountsRevision: 3, groupRevision: 2, subjectRevision: 4, [field]: 999 };
    expect(() => applyAssessmentCommand(state, command, domain, { assessmentId: "new", attemptId: "new", historyId: "new", occurredAt: "2026-11-06T10:00:00Z" })).toThrow();
  });
  it.each([2, 3, 4, 5] as const)("accepts grade %s and an independent absence", (grade) => {
    const state = save(create(), marks({ status: "graded", grade }));
    expect(publish(state).assessments[0].attempts[0].results).toEqual(marks({ status: "graded", grade }));
  });
  it.each([1, 6, 10, 3.5, "5", null])("rejects an invalid grade %s", (grade) => { expect(() => save(create(), marks({ status: "graded", grade } as never))).toThrow(); });
  it.each(["passed", "failed"] as const)("uses %s for an ordinary pass", (status) => {
    expect(save(create({ kind: "pass" }), marks({ status })).assessments[0].attempts[0].results[0].outcome).toEqual({ status });
    expect(() => save(create(), marks({ status }))).toThrow();
  });
  it("rejects numeric marks for an ordinary pass", () => { expect(() => save(create({ kind: "pass" }))).toThrow(); });
  it("requires exact roster results, rejecting duplicates, extras, omissions", () => {
    expect(() => save(create(), [marks()[0]])).toThrow();
    expect(() => save(create(), [marks()[0], marks()[0]])).toThrow();
    expect(() => save(create(), [marks()[0], { studentId: "stranger", outcome: null }])).toThrow();
  });
  it("allows an unfinished draft but requires every result to publish", () => { const state = save(create(), marks(null)); expect(() => publish(state)).toThrow(); expect(() => publish(create())).toThrow(); });
  it("locks published attempts and records a distinct publication snapshot", () => {
    const state = published(); expect(() => save(state)).toThrow(); expect(() => publish(state)).toThrow();
    expect(state.history.at(-1)).toMatchObject({ action: "published", actorId: teacher.id, results: marks() });
  });
  it("records by the Moscow moment even when its calendar day differs from UTC", () => {
    const state = create({ attempt: attemptDraft({ date: "2026-11-07", startsAt: "00:00" }) });
    const command: Payload = { type: "save-results", assessmentId: "assessment-0", attemptId: "attempt-0", results: marks() };
    expect(() => execute(state, command, teacher, context(), "2026-11-06T20:59:59.999Z")).toThrow(/назначенных/);
    const saved = execute(state, command, teacher, context(), "2026-11-06T21:00:00.000Z");
    expect(publish(saved, "2026-11-06T21:00:00.000Z").assessments[0].attempts[0].state).toBe("published");
  });
  it("allows retakes only after publication without altering the original attempt", () => {
    expect(() => add(create())).toThrow(); const state = published(); const next = add(state);
    expect(next.assessments[0].attempts[0]).toEqual(state.assessments[0].attempts[0]);
    expect(next.assessments[0].attempts[1]).toMatchObject({ kind: "retake", number: 2, studentIds: [student.id], results: [{ studentId: student.id, outcome: null }] });
    expect(() => add(state, "retake", { date: "2026-11-05" })).toThrow();
    expect(() => add(state, "retake", { studentIds: ["stranger"] })).toThrow();
  });
  it("does not invent a limit or prohibit retakes of a positive result", () => {
    let state = published();
    for (let index = 0; index < 4; index++) { state = add(state); state = save(state, [{ studentId: student.id, outcome: { status: "graded", grade: 5 } }]); state = publish(state); }
    expect(state.assessments[0].attempts).toHaveLength(5);
  });
  it("allows a writer outside a commission, with unique active chair and members", () => {
    const state = add(published(), "commission", { chairId: "chair", memberIds: ["member"] });
    expect(state.assessments[0].attempts[1]).toMatchObject({ teacherId: "teacher", chairId: "chair", memberIds: ["member"] });
    expect(() => add(published(), "commission", { chairId: "chair", memberIds: [] })).toThrow();
    expect(() => add(published(), "commission", { chairId: "chair", memberIds: ["chair"] })).toThrow();
    expect(() => add(published(), "commission", { chairId: "chair", memberIds: ["member", "member"] })).toThrow();
    expect(() => add(published(), "commission", { chairId: "student", memberIds: ["member"] })).toThrow();
    const domain = context(); domain.accounts[4] = { ...domain.accounts[4], status: "blocked" };
    expect(() => execute(published(), { type: "add-attempt", assessmentId: "assessment-0", kind: "commission", draft: attemptDraft({ chairId: "chair", memberIds: ["member"] }) }, config, domain)).toThrow();
  });
  it("limits commissions to the explicitly chosen commission retake kind", () => {
    expect(() => create({ attempt: attemptDraft({ chairId: "chair", memberIds: ["member"] }) })).toThrow();
    expect(() => add(published(), "retake", { chairId: "chair", memberIds: ["member"] })).toThrow();
  });
  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-06", "not-a-date"])("rejects invalid calendar date %s", (date) => { expect(() => create({ attempt: attemptDraft({ date }) })).toThrow(); });
});

describe("assessment document integrity", () => {
  it("accepts legacy attempts without rooms without rewriting history", () => {
    const state = add(published(), "commission", { chairId: "chair", memberIds: ["member"] });
    for (const attempt of state.assessments[0].attempts) delete attempt.room;
    expect(decodeAssessmentDocument(JSON.stringify(state))).toEqual(state);
    expect(add(publish(save(state, [{ studentId: student.id, outcome: { status: "graded", grade: 3 } }]))).history.slice(0, state.history.length)).toEqual(state.history);
  });
  it.each(["", " ", "A".repeat(257), "A\nB"])("rejects invalid room %j", (room) => {
    expect(() => add(published(), "retake", { room })).toThrow();
    expect(() => add(published(), "commission", { room, chairId: "chair", memberIds: ["member"] })).toThrow();
    expect(corrupt(create(), (state) => { state.assessments[0].attempts[0].room = room; })).toThrow();
  });
  it("requires rooms for new retakes and commissions but not primary attempts", () => {
    const attempt = attemptDraft(); delete attempt.room;
    expect(create({ attempt }).assessments[0].attempts[0].room).toBeUndefined();
    for (const kind of ["retake", "commission"] as const) {
      expect(() => execute(published(), { type: "add-attempt", assessmentId: "assessment-0", kind, draft: { ...attempt, ...(kind === "commission" ? { chairId: "chair", memberIds: ["member"] } : {}) } })).toThrow();
    }
  });
  it("round trips a complete history of primary, retake and commission", () => {
    let state = add(published()); state = publish(save(state, [{ studentId: student.id, outcome: { status: "graded", grade: 2 } }]));
    state = add(state, "commission", { chairId: "chair", memberIds: ["member"] });
    expect(decodeAssessmentDocument(JSON.stringify(state))).toEqual(state);
  });
  it("does not silently repair corrupt, unknown-version or extra-key data", () => {
    expect(() => decodeAssessmentDocument("{" )).toThrow(); expect(() => decodeAssessmentDocument("null")).toThrow();
    expect(() => decodeAssessmentDocument(JSON.stringify({ ...create(), version: 99 }))).toThrow();
    expect(() => decodeAssessmentDocument(JSON.stringify({ ...create(), extra: true }))).toThrow();
    expect(corrupt(create(), (state) => { state.assessments[0].attempts[0].results[0].outcome = { status: "graded", grade: 10 } as never; })).toThrow();
  });
  it.each([
    (state: AssessmentDocument) => { state.revision++; },
    (state: AssessmentDocument) => { state.history[0].attemptId = "missing"; },
    (state: AssessmentDocument) => { state.history[1].actorId = "stranger"; },
    (state: AssessmentDocument) => { state.history[2].results![0].outcome = { status: "graded", grade: 2 }; },
    (state: AssessmentDocument) => { state.history[2].occurredAt = "2026-11-06T10:01:00Z"; },
    (state: AssessmentDocument) => { state.assessments[0].attempts[0].results[0].outcome = null; },
    (state: AssessmentDocument) => { state.assessments[0].attempts[0].publishedBy = "stranger"; },
    (state: AssessmentDocument) => { state.assessments[0].roster.push({ ...state.assessments[0].roster[0] }); },
  ])("rejects audit or roster corruption %#", (mutate) => { expect(corrupt(published(), mutate)).toThrow(); });
  it("rejects a post-publication save, duplicate IDs and missing creation history", () => {
    expect(corrupt(published(), (state) => { state.history.push({ ...state.history[1], id: "late" }); state.revision++; })).toThrow();
    expect(corrupt(published(), (state) => { state.history[2].id = state.history[1].id; })).toThrow();
    expect(corrupt(published(), (state) => { state.history.shift(); state.revision--; })).toThrow();
  });
  it("rejects unsupported and unsafe record sizes", () => { expect(() => decodeAssessmentDocument(" ".repeat(16 * 1024 * 1024 + 1))).toThrow(); });
});

describe("scheduled moment and scientific supervision", () => {
  const cases = (["exam", "pass", "gradedPass", "internship", "thesis", "coursework"] as const).flatMap((kind) => (["primary", "retake", "commission"] as const).map((attemptKind) => ({ kind, attemptKind })));
  const prepare = ({ kind, attemptKind }: typeof cases[number]) => {
    let state = execute(emptyAssessmentDocument(), { type: "create", draft: draft({ kind, attempt: attemptDraft({ startsAt: attemptKind === "primary" ? "13:00" : "09:00" }) }) }, config, context(), "2026-11-06T09:00:00.000Z");
    if (attemptKind !== "primary") {
      const rows = marks(kind === "pass" ? { status: "passed" } : { status: "graded", grade: 5 });
      state = execute(state, { type: "save-results", assessmentId: "assessment-0", attemptId: "attempt-0", results: rows }, teacher, context(), "2026-11-06T09:00:00.000Z");
      state = execute(state, { type: "publish", assessmentId: "assessment-0", attemptId: "attempt-0" }, teacher, context(), "2026-11-06T09:00:00.000Z");
      state = execute(state, { type: "add-attempt", assessmentId: "assessment-0", kind: attemptKind, draft: attemptDraft({ startsAt: "13:00", ...(attemptKind === "commission" ? { chairId: "chair", memberIds: ["member"] } : {}) }) }, config, context(), "2026-11-06T09:00:00.000Z");
    }
    return state;
  };
  it.each(cases)("guards save and publish at the exact instant for $kind / $attemptKind", (testCase) => {
    const state = prepare(testCase); const attempt = state.assessments[0].attempts.at(-1)!;
    expect(assessmentStartsAt(attempt)).toBe(Date.parse("2026-11-06T10:00:00.000Z"));
    expect(canRecordAssessmentResults(attempt, "2026-11-06T09:59:59.999Z")).toBe(false);
    expect(canRecordAssessmentResults(attempt, "2026-11-06T10:00:00.000Z")).toBe(true);
    expect(canRecordAssessmentResults(attempt, "2026-11-06T10:00:00.001Z")).toBe(true);
    const rows = marks(testCase.kind === "pass" ? { status: "passed" } : { status: "graded", grade: 5 });
    const saveCommand: Payload = { type: "save-results", assessmentId: "assessment-0", attemptId: attempt.id, results: rows };
    const publishCommand: Payload = { type: "publish", assessmentId: "assessment-0", attemptId: attempt.id };
    expect(() => execute(state, saveCommand, teacher, context(), "2026-11-06T09:59:59.999Z")).toThrow(/назначенных/);
    expect(() => execute(state, publishCommand, teacher, context(), "2026-11-06T09:59:59.999Z")).toThrow(/назначенных/);
    for (const at of ["2026-11-06T10:00:00.000Z", "2026-11-06T10:00:00.001Z"]) {
      const saved = execute(state, saveCommand, teacher, context(), at);
      const result = execute(saved, publishCommand, teacher, context(), at);
      expect(result.assessments[0].attempts.at(-1)!.state).toBe("published");
      expect(decodeAssessmentDocument(JSON.stringify(result))).toEqual(result);
    }
  });
  it.each(["thesis", "coursework"] as const)("keeps the same scientific advisor across all attempts for %s", (kind) => {
    let state = publish(save(create({ kind })));
    expect(state.assessments[0].supervisorId).toBe(teacher.id);
    expect(() => add(state, "retake", { teacherId: "stranger" })).toThrow(/руководитель/);
    expect(() => add(state, "commission", { teacherId: "stranger", chairId: "chair", memberIds: ["member"] })).toThrow(/руководитель/);
    state = add(state, "commission", { chairId: "chair", memberIds: ["member"] });
    expect(() => save(state, [{ studentId: student.id, outcome: { status: "graded", grade: 5 } }], account("chair", "teacher"))).toThrow();
    expect(save(state, [{ studentId: student.id, outcome: { status: "graded", grade: 5 } }]).assessments[0].attempts[1].teacherId).toBe(teacher.id);
  });
  it("compares retake times on the same date", () => {
    expect(() => add(published(), "retake", { startsAt: "08:59" })).toThrow(/Дата и время/);
    expect(add(published(), "retake", { startsAt: "09:00" }).assessments[0].attempts).toHaveLength(2);
  });
  it.each(["24:00", "12:60", "9:00", "12:00:00", "", null])("rejects malformed time %s", (startsAt) => { expect(() => create({ attempt: attemptDraft({ startsAt: startsAt as string }) })).toThrow(); });
  it("fails closed when a historical save predates the scheduled moment", () => {
    const state = published();
    expect(corrupt(state, (data) => { data.assessments[0].attempts[0].startsAt = "13:01"; })).toThrow();
    expect(corrupt(save(create()), (data) => { data.assessments[0].attempts[0].startsAt = "13:01"; })).toThrow();
  });
  it("rejects missing time, wrong supervisor and a supervisor on an ordinary exam", () => {
    expect(corrupt(create(), (data) => { delete (data.assessments[0].attempts[0] as Partial<AssessmentAttemptDraft>).startsAt; })).toThrow();
    expect(corrupt(create({ kind: "thesis" }), (data) => { data.assessments[0].supervisorId = "stranger"; })).toThrow();
    expect(corrupt(create(), (data) => { data.assessments[0].supervisorId = teacher.id; })).toThrow();
  });
});

describe("record book metadata and legacy compatibility", () => {
  const metadata = { semester: 1, hours: 72, category: "required" as const };
  it("persists explicit semester and hours with the creation audit snapshot", () => {
    const state = create({ recordBook: metadata });
    expect(state.assessments[0].recordBook).toEqual(metadata);
    expect(state.history[0].recordBook).toEqual(metadata);
    expect(decodeAssessmentDocument(JSON.stringify(state))).toEqual(state);
  });
  it("allows a configurator to classify existing published records without changing grades or attempts", () => {
    const state = published(); const before = structuredClone(state.assessments[0].attempts);
    const updated = execute(state, { type: "update-record-book", assessmentId: "assessment-0", recordBook: metadata });
    expect(updated.assessments[0].attempts).toEqual(before);
    expect(updated.history.at(-1)).toMatchObject({ action: "record-book-updated", recordBook: metadata, results: null });
    expect(state.assessments[0].recordBook).toBeNull();
    expect(decodeAssessmentDocument(JSON.stringify(updated))).toEqual(updated);
    expect(() => execute(state, { type: "update-record-book", assessmentId: "assessment-0", recordBook: metadata }, teacher)).toThrow(/настройщик/);
  });
  it("preserves metadata snapshots over subsequent results and metadata corrections", () => {
    const initial = create({ recordBook: metadata });
    const saved = save(initial);
    const updated = execute(saved, { type: "update-record-book", assessmentId: "assessment-0", recordBook: { ...metadata, semester: 2, category: "elective" } });
    const result = publish(updated);
    expect(result.history.map((entry) => entry.recordBook?.semester)).toEqual([1, 1, 2, 2]);
    expect(corrupt(result, (data) => { data.assessments[0].recordBook!.hours = 999; })).toThrow();
    expect(corrupt(result, (data) => { data.history[1].recordBook!.semester = 3; })).toThrow();
  });
  it.each([{ semester: 0 }, { semester: 1.5 }, { semester: 100 }, { hours: -1 }, { hours: 1.5 }, { hours: 100001 }, { category: "unknown" }])("rejects invalid record book values %j", (patch) => {
    expect(() => create({ recordBook: { ...metadata, ...patch } as never })).toThrow();
  });
  it("migrates version one in memory without guessing hours/semester or losing IDs, results or history", () => {
    const state = published();
    const legacy = { ...state, version: 1, assessments: state.assessments.map(({ recordBook: _metadata, ...entry }) => entry), history: state.history.map(({ recordBook: _metadata, ...entry }) => entry) };
    const raw = JSON.stringify(legacy);
    const migrated = decodeAssessmentDocument(raw);
    expect(migrated).toEqual(state);
    expect(migrated.version).toBe(2); expect(migrated.assessments[0].recordBook).toBeNull();
    expect(JSON.stringify(legacy)).toBe(raw);
    const corrupted = structuredClone(legacy); Object.assign(corrupted.assessments[0], { unexpected: 12 });
    expect(() => decodeAssessmentDocument(JSON.stringify(corrupted))).toThrow();
  });
});

describe("assessment projections", () => {
  it.each(["primary", "retake", "commission"] as const)("shows future %s schedules only to participants, with no results", (kind) => {
    const fields = { date: "2099-11-06", room: "B-202", ...(kind === "commission" ? { chairId: "chair", memberIds: ["member"] } : {}) };
    const state = kind === "primary" ? create({ attempt: attemptDraft({ ...fields, studentIds: [student.id] }) }) : add(published(), kind, fields);
    const own = projectAssessments(state, student)[0];
    expect(own.attempts.at(-1)).toMatchObject({ kind, date: fields.date, room: "B-202", state: "draft", studentIds: [student.id], results: [] });
    expect(own.roster.map((row) => row.studentId)).toEqual([student.id]);
    expect(projectAssessments(state, account("outsider", "student"))).toEqual([]);
    expect(state.assessments[0].attempts.at(-1)!.results).toHaveLength(1);
  });
  it("exposes draft schedules but not unpublished results or another student's identity", () => {
    expect(projectAssessments(save(create()), student)[0].attempts[0].results).toEqual([]);
    const state = add(published(), "retake", { teacherId: "stranger", studentIds: [other.id] });
    const projection = projectAssessments(state, student);
    expect(projection[0].roster.map((row) => row.studentId)).toEqual([student.id]);
    expect(projection[0].attempts).toHaveLength(1);
    expect(projection[0].attempts[0].studentIds).toEqual([student.id]);
    expect(projection[0].attempts[0].results).toEqual([marks()[0]]);
    expect(JSON.stringify(projection)).not.toContain('"other"');
    projection[0].roster[0].name = "Изменено"; expect(state.assessments[0].roster[0].name).not.toBe("Изменено");
  });
  it("a teacher only sees appointed attempts and their participants", () => {
    const state = add(published(), "commission", { teacherId: "stranger", studentIds: [other.id], chairId: "chair", memberIds: ["member"] });
    expect(projectAssessments(state, account("chair", "teacher"))).toEqual([]);
    const projection = projectAssessments(state, account("stranger", "teacher"));
    expect(projection[0].attempts).toHaveLength(1); expect(projection[0].roster.map((row) => row.studentId)).toEqual([other.id]);
    expect(projection[0].attempts[0].kind).toBe("commission");
  });
  it("configurators see everything while blocked accounts cannot read", () => {
    const state = add(); expect(projectAssessments(state, config)).toEqual(state.assessments);
    expect(() => projectAssessments(state, { ...student, status: "blocked" })).toThrow();
  });
});
