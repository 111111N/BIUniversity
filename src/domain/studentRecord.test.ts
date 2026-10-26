import { describe, expect, it } from "vitest";
import { allocateStudentNumber, getStudentNumberYear, isStudentRecord, previewStudentNumber } from "./studentRecord";

const date = "2026-10-26T10:00:00Z";
describe("student record numbering", () => {
  it("previews without consuming a number and issues exactly year, campus and four digits", () => {
    const state = { revision: 1, accounts: [] };
    expect(previewStudentNumber(state, 3, date)).toEqual({ number: "202630001", year: 2026, campus: 3, sequence: 1, revision: 1 });
    expect(previewStudentNumber(state, 3, date).number).toBe("202630001");
    expect(allocateStudentNumber(state, 3, "202630001", date)).toMatchObject({ studentRecord: { number: "202630001", issuedAt: date }, studentNumberCounters: { "2026:3": 1 } });
    expect(state).toEqual({ revision: 1, accounts: [] });
  });
  it("keeps independent counters per campus and year, using Moscow's new-year boundary", () => {
    const state = { revision: 1, accounts: [], studentNumberCounters: { "2026:1": 22, "2026:9": 9 } };
    expect(previewStudentNumber(state, 1, date).number).toBe("202610023");
    expect(previewStudentNumber(state, 9, date).number).toBe("202690010");
    expect(getStudentNumberYear("2026-12-31T20:59:59Z")).toBe(2026);
    expect(previewStudentNumber(state, 1, "2026-12-31T21:00:00Z").number).toBe("202710001");
  });
  it("does not reuse an existing record if a counter is behind, and rejects stale or forged previews", () => {
    const record = allocateStudentNumber({ revision: 0, accounts: [] }, 1, "202610001", date).studentRecord;
    const state = { revision: 1, accounts: [{ studentRecord: record }] };
    expect(previewStudentNumber(state, 1, date).number).toBe("202610002");
    expect(() => allocateStudentNumber(state, 1, "202610001", date)).toThrow("изменился");
    expect(() => allocateStudentNumber(state, 1, "202619999", date)).toThrow("изменился");
  });
  it("rejects invalid campuses, exhausted sequences and damaged number components", () => {
    for (const campus of [0, 10, 1.5]) expect(() => previewStudentNumber({ revision: 0, accounts: [] }, campus, date)).toThrow("корпус");
    expect(() => previewStudentNumber({ revision: 0, accounts: [], studentNumberCounters: { "2026:1": 9999 } }, 1, date)).toThrow("исчерпаны");
    const record = allocateStudentNumber({ revision: 0, accounts: [] }, 1, "202610001", date).studentRecord;
    expect(isStudentRecord(record)).toBe(true);
    expect(isStudentRecord({ ...record, campus: 2 })).toBe(false);
    expect(isStudentRecord({ ...record, issuedAt: "invalid" })).toBe(false);
  });
});
