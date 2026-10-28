import { describe, expect, it } from "vitest";
import { getStudentNumberRequestKey, getUsableStudentNumberPreview, selectStudentNumberRequest, type StudentNumberRequestState } from "./studentNumberRequestState";

const key = getStudentNumberRequestKey(true, 3, "admin", 1, "create:0", 0)!;
const preview = { number: "202630001", year: 2026, campus: 3, sequence: 1, revision: 0 };
const ready: StudentNumberRequestState = { key, preview, error: "", loading: false };
describe("student number request boundaries", () => {
  it("shows a matching result and immediately clears it for a manual retry", () => {
    expect(selectStudentNumberRequest(ready, key).preview).toBe(preview);
    const retry = getStudentNumberRequestKey(true, 3, "admin", 1, "create:0", 1);
    expect(selectStudentNumberRequest(ready, retry)).toMatchObject({ preview: null, error: "", loading: true });
  });
  it.each([
    { campus: 9 }, { actorId: "other-admin" }, { actorRevision: 2 }, { scope: "another-account:0" }, { scope: "create:1" },
  ])("hides a prior success or error after context changes: %j", (patch) => {
    const input = { campus: 3, actorId: "admin", actorRevision: 1, scope: "create:0", ...patch };
    const nextKey = getStudentNumberRequestKey(true, input.campus, input.actorId, input.actorRevision, input.scope, 0);
    for (const state of [ready, { ...ready, preview: null, error: "Ошибка предыдущего запроса" }]) expect(selectStudentNumberRequest(state, nextKey)).toMatchObject({ preview: null, error: "", loading: true });
  });
  it("does not expose even a late old response once a different request is current", () => {
    const next = getStudentNumberRequestKey(true, 9, "admin", 1, "create:0", 0);
    const late = { ...ready, preview: { ...preview } };
    expect(selectStudentNumberRequest(late, next).preview).toBeNull();
    expect(late.preview.number).toBe("202630001");
  });
  it("clears pending, success and failure when the panel is disabled or no campus is selected", () => {
    for (const state of [ready, { ...ready, preview: null, error: "Ошибка" }, { ...ready, preview: null, loading: true }]) expect(selectStudentNumberRequest(state, null)).toEqual({ key: null, preview: null, error: "", loading: false });
    expect(getStudentNumberRequestKey(false, 3, "admin", 1, "create", 0)).toBeNull();
    expect(getStudentNumberRequestKey(true, 0, "admin", 1, "create", 0)).toBeNull();
  });
  it("requires matching document version, campus and Moscow year", () => {
    const date = "2026-10-28T10:00:00Z";
    expect(getUsableStudentNumberPreview(ready, 3, 0, date)).toBe(preview);
    expect(getUsableStudentNumberPreview(ready, 3, 1, date)).toBeNull();
    expect(getUsableStudentNumberPreview(ready, 9, 0, date)).toBeNull();
    expect(getUsableStudentNumberPreview(ready, 3, 0, "2026-12-31T21:00:00Z")).toBeNull();
    expect(getUsableStudentNumberPreview(ready, 3, 0, "2026-12-31T20:59:59Z")).toBe(preview);
  });
  it("does not offer a cached number while loading or after failure", () => {
    for (const state of [{ ...ready, loading: true }, { ...ready, error: "Нет доступа" }, { ...ready, preview: null }]) expect(getUsableStudentNumberPreview(state, 3, 0, "2026-10-28T10:00:00Z")).toBeNull();
  });
  it("keeps an empty creation form safe before any campus or preview exists", () => {
    expect(getUsableStudentNumberPreview({ preview: null, loading: false, error: "" }, undefined, 0, "2026-10-28T10:00:00Z")).toBeNull();
  });
});
