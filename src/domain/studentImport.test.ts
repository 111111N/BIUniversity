import { describe, expect, it } from "vitest";
import { applyStudentImport, previewStudentImport, studentImportSourceKey, type ApplyStudentImportCommand, type StudentImportRequest } from "./studentImport";
import { createInitialAccountsDocument } from "../data/accountStore";
import { decodeAccountsDocument } from "./accounts";

const groups = [{ id: "112-mko", name: "112-МКо", campus: 3 }, { id: "new-group", name: "101-ИВТ", campus: 7 }];
const date = "2026-10-26T10:00:00.000Z";
const input: StudentImportRequest = { defaultGroupId: "112-mko", defaultCampus: null, rows: [{ line: 2, name: "Новый Студент", login: "new.student", email: "", group: "", campus: "" }] };
const command = (request = input): ApplyStudentImportCommand => ({ actorId: "configurator-demo", actorRevision: 1, expectedRevision: 0, batchId: "batch-one", fingerprint: "a".repeat(64), request, expectedGroupRevision: 0, expectedYear: 2026, expectedStudentNumbers: ["202630001"] });
const identities = [{ id: "new-student", changeId: "new-audit" }];

describe("student import rules", () => {
  it("previews consecutive numbers by campus without modifying state or reserving numbers", () => {
    const state = createInitialAccountsDocument();
    const request = { ...input, rows: [...input.rows, { ...input.rows[0], line: 3, name: "Другой Студент", login: "other.student", group: "101-ИВТ" }, { ...input.rows[0], line: 4, login: "third.student", campus: "Корпус 3" }] };
    const preview = previewStudentImport(state, groups, request, date);
    expect(preview.rows.map((row) => row.studentNumber)).toEqual(["202630001", "202670001", "202630002"]);
    expect(preview.ready).toBe(3);
    expect(state.accounts).toHaveLength(3); expect(state.studentNumberCounters).toBeUndefined();
  });
  it("prioritizes row data, then common campus, then the group's campus", () => {
    const preview = previewStudentImport(createInitialAccountsDocument(), groups, { ...input, defaultCampus: 9, rows: [{ ...input.rows[0], campus: "2" }, { ...input.rows[0], line: 3, login: "other.student", group: "101-ИВТ" }] }, date);
    expect(preview.rows.map((row) => row.studentNumber)).toEqual(["202620001", "202690001"]);
  });
  it("marks every duplicate login, while namesakes remain separate with a warning", () => {
    const request = { ...input, rows: [{ ...input.rows[0], login: "NEW.STUDENT" }, { ...input.rows[0], line: 3, login: "ｎｅｗ.ｓｔｕｄｅｎｔ" }] };
    const preview = previewStudentImport(createInitialAccountsDocument(), groups, request, date);
    expect(preview.errors).toBe(2); expect(preview.ready).toBe(0);
    expect(preview.rows.every((row) => row.errors.some((error) => error.includes("повторяется")))).toBe(true);
    const namesakes = previewStudentImport(createInitialAccountsDocument(), groups, { ...input, rows: [input.rows[0], { ...input.rows[0], line: 3, login: "other.student" }] }, date);
    expect(namesakes.ready).toBe(2); expect(namesakes.rows.every((row) => row.warnings.length)).toBe(true);
  });
  it("skips a matching existing student without changing their access or issuing a number", () => {
    const state = createInitialAccountsDocument(); state.accounts[1].status = "blocked";
    const preview = previewStudentImport(state, groups, { ...input, rows: [{ ...input.rows[0], name: "АННА СМИРНОВА", login: "anna.smirnova" }, { ...input.rows[0], line: 3 }] }, date);
    expect(preview.existing).toBe(1); expect(preview.rows[0]).toMatchObject({ status: "existing", accountId: "anna-smirnova" });
    expect(preview.rows[0].warnings[0]).toContain("заблокирован");
    expect(preview.rows[1].studentNumber).toBe("202630001"); expect(state.accounts[1].status).toBe("blocked");
  });
  it("rejects existing logins with conflicting identity, type, group or email", () => {
    for (const patch of [{ name: "Другая Анна", login: "anna.smirnova" }, { name: "Анна Смирнова", login: "anna.smirnova", group: "101-ИВТ" }, { name: "Анна Смирнова", login: "anna.smirnova", email: "new@example.test" }, { name: "Елена Волкова", login: "elena.volkova" }]) {
      const preview = previewStudentImport(createInitialAccountsDocument(), groups, { ...input, rows: [{ ...input.rows[0], ...patch }] }, date);
      expect(preview.rows[0].errors.join()).toContain("Логин занят");
    }
  });
  it("reports unknown groups, invalid campus, email and login errors by row", () => {
    const preview = previewStudentImport(createInitialAccountsDocument(), groups, { ...input, rows: [{ ...input.rows[0], group: "missing", campus: "10", email: "broken", login: "x" }] }, date);
    expect(preview.errors).toBe(1); expect(preview.rows[0].errors).toHaveLength(3);
  });
  it("does not wrap sequences when the campus counter is exhausted", () => {
    const state = { ...createInitialAccountsDocument(), studentNumberCounters: { "2026:3": 9998 } };
    const preview = previewStudentImport(state, groups, { ...input, rows: [input.rows[0], { ...input.rows[0], line: 3, login: "last.student" }] }, date);
    expect(preview.rows[0].studentNumber).toBe("202639999");
    expect(preview.rows[1].errors.join()).toContain("исчерпаны"); expect(preview.errors).toBe(1);
  });
  it("uses normalized source values rather than display line numbers for the source key", () => {
    expect(studentImportSourceKey({ ...input, rows: [{ ...input.rows[0], line: 99, name: " Новый   Студент ", login: "NEW.STUDENT" }] })).toBe(studentImportSourceKey(input));
  });
  it("creates one atomic document revision, audit and receipt with canonical student enrolment", () => {
    const state = createInitialAccountsDocument();
    const result = applyStudentImport(state, command(), groups, 0, date, identities);
    expect(result.state.revision).toBe(1); expect(result.state.accounts).toHaveLength(4);
    expect(result.state.accounts.at(-1)).toMatchObject({ id: "new-student", role: "student", studentGroupId: "112-mko", memberships: [], studentRecord: { number: "202630001" } });
    expect(result.state.history.at(-1)).toMatchObject({ accountId: "new-student", importBatchId: "batch-one", action: "created" });
    expect(result.receipt.created[0]).toEqual({ line: 2, accountId: "new-student", studentNumber: "202630001" });
    expect(decodeAccountsDocument(JSON.stringify(result.state))).toEqual(result.state);
    expect(state.accounts).toHaveLength(3);
  });
  it("rejects stale document/group/year/number previews before constructing any saved state", () => {
    const state = createInitialAccountsDocument();
    for (const patch of [{ expectedRevision: 1 }, { expectedGroupRevision: 1 }, { expectedYear: 2027 }, { expectedStudentNumbers: ["202630002"] }]) expect(() => applyStudentImport(state, { ...command(), ...patch }, groups, 0, date, identities)).toThrow();
    expect(state.studentImports).toBeUndefined();
  });
  it("refuses all rows if any row is invalid", () => {
    const request = { ...input, rows: [input.rows[0], { ...input.rows[0], line: 3, login: "wrong", group: "unknown" }] };
    expect(() => applyStudentImport(createInitialAccountsDocument(), command(request), groups, 0, date, identities)).toThrow("есть ошибки");
  });
  it("returns the original receipt on retry and reauthorizes even an already completed batch", () => {
    const first = applyStudentImport(createInitialAccountsDocument(), command(), groups, 0, date, identities);
    const replay = applyStudentImport(first.state, command(), groups, 0, date, []);
    expect(replay.replayed).toBe(true); expect(replay.state).toBe(first.state); expect(replay.receipt).toEqual(first.receipt);
    expect(() => applyStudentImport(first.state, { ...command(), fingerprint: "b".repeat(64) }, groups, 0, date, [])).toThrow("другого списка");
    const blocked = { ...first.state, accounts: first.state.accounts.map((account) => account.role === "configurator" ? { ...account, status: "blocked" as const } : account) };
    expect(() => applyStudentImport(blocked, command(), groups, 0, date, [])).toThrow("активному");
  });
});
