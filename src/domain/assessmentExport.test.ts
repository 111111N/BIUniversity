import { describe, expect, it } from "vitest";
import type { PortalAccount } from "./accounts";
import { createAssessmentStatement } from "./assessmentExport";
import { applyAssessmentCommand, emptyAssessmentDocument, type AssessmentDomainContext } from "./assessments";
import type { AssessmentCommand, AssessmentCommandContext, AssessmentDocument, AssessmentKind, AssessmentStatementRequest } from "./assessmentTypes";
import { parseImportTable } from "./importTable";

const account = (id: string, role: PortalAccount["role"]): PortalAccount => ({ id, role, name: `Имя ${id}`, login: id, revision: 1, status: "active", memberships: [] });
const config = account("config", "configurator");
const teacher = account("teacher", "teacher");
const student = { ...account("student", "student"), name: "Анна; \"Смирнова\" Ивановна", studentGroupId: "group", studentRecord: { number: "202610001", year: 2026, campus: 1, sequence: 1, issuedAt: "2026-09-01T09:00:00Z" } };
const peer = { ...account("peer", "student"), studentGroupId: "group", status: "blocked" as const };
const context: AssessmentDomainContext = { accounts: [config, teacher, student, peer, account("chair", "teacher"), account("member", "teacher"), account("stranger", "teacher")], accountsRevision: 3, groups: [{ id: "group", name: "112-МКо" }], groupRevision: 2, subjects: [{ id: "subject", name: "Теория вероятностей" }], subjectRevision: 4 };
type Payload = { [K in AssessmentCommand["type"]]: Omit<Extract<AssessmentCommand, { type: K }>, keyof AssessmentCommandContext> }[AssessmentCommand["type"]];
const request = (state: AssessmentDocument, actorId = teacher.id, attemptId = state.assessments[0].attempts[0].id): AssessmentStatementRequest => ({ actorId, actorRevision: 1, expectedRevision: state.revision, accountsRevision: 3, groupRevision: 2, subjectRevision: 4, assessmentId: state.assessments[0].id, attemptId });
const execute = (state: AssessmentDocument, operation: Payload, actorId: string): AssessmentDocument => applyAssessmentCommand(state, {
  actorId, actorRevision: 1, expectedRevision: state.revision, accountsRevision: 3, groupRevision: 2, subjectRevision: 4, ...operation,
}, context, { assessmentId: `assessment-${state.revision}`, attemptId: `attempt-${state.revision}`, historyId: `history-${state.revision}`, occurredAt: "2026-11-06T09:00:00.000Z" });
const create = (kind: AssessmentKind = "exam", withRecordBook = true) => execute(emptyAssessmentDocument(), { type: "create", draft: { title: "Контроль; знаний", kind, groupId: "group", subjectId: "subject", period: "2026/2027", ...(withRecordBook ? { recordBook: { semester: 3, hours: 72, category: "elective" as const } } : {}), attempt: { date: "2026-11-06", startsAt: "12:00", room: "А-101", teacherId: teacher.id, chairId: null, memberIds: [], studentIds: [student.id, peer.id] } } }, config.id);
const complete = (state: AssessmentDocument) => {
  const attempt = state.assessments[0].attempts.at(-1)!;
  const ids = { assessmentId: state.assessments[0].id, attemptId: attempt.id };
  const results = attempt.studentIds.map((studentId, index) => ({ studentId, outcome: index ? { status: "absent" as const } : state.assessments[0].kind === "pass" ? { status: "failed" as const } : { status: "graded" as const, grade: 2 as const } }));
  return execute(execute(state, { type: "save-results", ...ids, results }, teacher.id), { type: "publish", ...ids }, teacher.id);
};
const table = (state: AssessmentDocument, actorId = teacher.id, attemptId?: string) => parseImportTable(createAssessmentStatement(state, request(state, actorId, attemptId), context).csv, ";").records.map((row) => row.cells);

describe("published assessment CSV export", () => {
  it.each<AssessmentKind>(["exam", "pass", "gradedPass", "internship", "thesis", "coursework"])("exports %s with explicit record-book metadata and Moscow time", (kind) => {
    const state = complete(create(kind));
    const before = structuredClone(state);
    const file = createAssessmentStatement(state, request(state), context);
    const rows = table(state);
    expect(file.csv.startsWith("\uFEFF")).toBe(true);
    expect(file.filename).toMatch(/^assessment-[^/\\:*?"<>|]+\.csv$/);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.length === rows[0].length)).toBe(true);
    expect(rows[1].slice(0, 4)).toEqual(["1", student.name, "202610001", kind === "pass" ? "Не зачтено" : "2"]);
    expect(rows[2][3]).toBe("Неявка");
    expect(rows[1].slice(9, 12)).toEqual(["3", "72", "Факультатив"]);
    expect(rows[1].slice(14, 17)).toEqual(["06.11.2026", "12:00", "А-101"]);
    expect(rows[1][20]).toMatch(/06\.11\.2026.*12:00:00/);
    expect(state).toEqual(before);
  });
  it("exports only the explicitly selected commission participants and preserves the earlier attempt", () => {
    const primary = complete(create());
    const state = complete(execute(primary, { type: "add-attempt", assessmentId: primary.assessments[0].id, kind: "commission", draft: { date: "2026-11-06", startsAt: "12:00", room: "А-102", teacherId: teacher.id, chairId: "chair", memberIds: ["member"], studentIds: [peer.id] } }, config.id));
    const rows = table(state, config.id, state.assessments[0].attempts[1].id);
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe(peer.name);
    expect(rows[1].slice(12, 14)).toEqual(["Комиссионная пересдача", "2"]);
    expect(rows[1].slice(18, 20)).toEqual(["Имя chair", "Имя member"]);
    expect(table(state)).toEqual(table(primary));
  });
  it("keeps the roster snapshot after a student's name and group change and escapes spreadsheet formulas", () => {
    const state = complete(create());
    const changed = { ...context, accounts: context.accounts.map((entry) => entry.id === student.id ? { ...entry, name: "Другое имя", studentGroupId: "another" } : entry) };
    expect(parseImportTable(createAssessmentStatement(state, request(state), changed).csv, ";").records[1].cells[1]).toBe(student.name);
    state.assessments[0].title = '=HYPERLINK("https://example.invalid")';
    expect(table(state)[1][4]).toBe(`'${state.assessments[0].title}`);
    expect(table(complete(create("exam", false)))[1].slice(9, 12)).toEqual(["", "", ""]);
  });
  it("rejects students, unrelated teachers and commission members", () => {
    const state = complete(create());
    for (const actorId of [student.id, "stranger", "chair", "member"]) expect(() => createAssessmentStatement(state, request(state, actorId), context)).toThrow();
    expect(() => table(state, config.id)).not.toThrow();
    expect(() => createAssessmentStatement(state, request(state), { ...context, accounts: context.accounts.map((entry) => entry.id === teacher.id ? { ...entry, status: "blocked" } : entry) })).toThrow("недоступна");
  });
  it.each(["expectedRevision", "actorRevision", "accountsRevision", "groupRevision", "subjectRevision"] as const)("rejects stale %s", (field) => {
    const state = complete(create());
    expect(() => createAssessmentStatement(state, { ...request(state), [field]: 999 }, context)).toThrow();
  });
  it("rejects drafts, foreign IDs, missing participants and incomplete published results", () => {
    expect(() => table(create())).toThrow("опубликованную");
    const state = complete(create());
    expect(() => table(state, teacher.id, "missing")).toThrow("недоступна");
    state.assessments[0].attempts[0].results[0].outcome = null;
    expect(() => table(state)).toThrow("не хватает");
  });
});
