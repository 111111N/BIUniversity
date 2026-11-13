import { describe, expect, it } from "vitest";
import type { PortalAccount } from "./accounts";
import {
  decodeAcademicPeriodsDocument, emptyAcademicPeriodsDocument, executeAcademicPeriodCommand, isAcademicCalendarDate,
  type AcademicPeriodCommand, type AcademicPeriodsDocument,
} from "./academicPeriods";

const actor: PortalAccount = { id: "configurator", login: "configurator", name: "Настройщик", role: "configurator", revision: 1, memberships: [] };
const yearDraft = { name: "2026–2027", startsOn: "2026-09-01", endsOn: "2027-08-31" };
const termDraft = { name: "Осенний семестр", startsOn: "2026-09-01", endsOn: "2027-01-31" };
const time = "2026-11-13T09:00:00.000Z";
type Operation = AcademicPeriodCommand extends infer C ? C extends AcademicPeriodCommand ? Omit<C, "actorId" | "actorRevision" | "expectedRevision"> : never : never;
const execute = (state: AcademicPeriodsDocument, operation: Operation, id: string) => executeAcademicPeriodCommand(state,
  { actorId: actor.id, actorRevision: actor.revision, expectedRevision: state.revision, ...operation } as AcademicPeriodCommand, actor,
  { entityId: id, eventId: `event-${state.revision + 1}`, occurredAt: time });
const setup = () => {
  const year = execute(emptyAcademicPeriodsDocument(), { type: "create-year", draft: yearDraft }, "year-2026");
  const state = execute(year, { type: "create-term", yearId: "year-2026", draft: termDraft }, "term-autumn");
  return { year, state };
};

describe("academic calendar foundations", () => {
  it.each(["2024-02-29", "2000-02-29", "0001-01-01", "0099-12-31", "9999-12-31"])("accepts an explicit Gregorian day %s without a timezone", value => {
    expect(isAcademicCalendarDate(value)).toBe(true);
  });
  it.each([null, "", "2026-02-29", "2026-02-30", "1900-02-29", "2026-13-01", "2026-11-31", "2026-1-01", "0000-01-01", "10000-01-01", "2026-11-13T00:00:00Z"])("rejects invalid or ambiguous days %s", value => {
    expect(isAcademicCalendarDate(value)).toBe(false);
  });
  it("keeps explicit dates, stable IDs and replayable snapshots without changing the source", () => {
    const empty = emptyAcademicPeriodsDocument(), before = JSON.stringify(empty);
    const year = execute(empty, { type: "create-year", draft: { ...yearDraft, name: "  ２０２６–２０２７  " } }, "year-2026");
    const state = execute(year, { type: "create-term", yearId: "year-2026", draft: termDraft }, "term-autumn");
    expect(JSON.stringify(empty)).toBe(before); expect(year.years[0].name).toBe("2026–2027");
    expect(state).toMatchObject({ version: 1, revision: 2, years: [{ id: "year-2026", revision: 1 }], terms: [{ id: "term-autumn", yearId: "year-2026", revision: 1 }] });
    expect(state.history.map(row => [row.entity, row.action, row.before])).toEqual([["year", "created", null], ["term", "created", null]]);
    expect(decodeAcademicPeriodsDocument(JSON.stringify(state))).toEqual(state);
  });
  it("does not impose a September start, a duration or exactly two terms", () => {
    let state = execute(emptyAcademicPeriodsDocument(), { type: "create-year", draft: { name: "Особый календарь", startsOn: "2028-02-01", endsOn: "2028-11-30" } }, "year");
    for (let index = 0; index < 3; index++) state = execute(state, { type: "create-term", yearId: "year", draft: { name: `Модуль ${index + 1}`, startsOn: "2028-02-01", endsOn: "2028-11-30" } }, `term-${index}`);
    expect(state.terms).toHaveLength(3);
  });
  it("supports inclusive boundaries and a single-day period", () => {
    const { year } = setup();
    expect(execute(year, { type: "create-term", yearId: "year-2026", draft: { ...termDraft, startsOn: "2027-08-31", endsOn: "2027-08-31" } }, "term").terms[0].endsOn).toBe("2027-08-31");
  });
  it.each([
    { ...termDraft, startsOn: "2026-08-31" }, { ...termDraft, endsOn: "2027-09-01" },
    { ...termDraft, startsOn: "2027-01-31", endsOn: "2027-01-30" }, { ...termDraft, endsOn: "2027-02-29" },
  ])("rejects invalid term boundaries", draft => {
    const { year } = setup(); expect(() => execute(year, { type: "create-term", yearId: "year-2026", draft }, "term")).toThrow();
  });
  it("rejects a missing year and IDs reused across years or terms", () => {
    const { year } = setup();
    expect(() => execute(year, { type: "create-term", yearId: "missing", draft: termDraft }, "term")).toThrow("выбранный учебный год");
    expect(() => execute(year, { type: "create-term", yearId: "year-2026", draft: termDraft }, "year-2026")).toThrow();
  });
  it("reserves normalized year names and term names within their parent year", () => {
    const { state } = setup();
    expect(() => execute(state, { type: "create-year", draft: { ...yearDraft, name: " ２０２６–２０２７ " } }, "other")).toThrow("названием");
    expect(() => execute(state, { type: "create-term", yearId: "year-2026", draft: { ...termDraft, name: "ОСЕННИЙ   СЕМЕСТР" } }, "other")).toThrow("названием");
    const other = execute(state, { type: "create-year", draft: { ...yearDraft, name: "Другой год" } }, "other-year");
    expect(execute(other, { type: "create-term", yearId: "other-year", draft: termDraft }, "other-term").terms).toHaveLength(2);
  });
  it("edits records without changing identity, rewriting earlier history or mutating the input", () => {
    const { state } = setup(), raw = JSON.stringify(state);
    const next = execute(state, { type: "update-term", termId: "term-autumn", entityRevision: 1, draft: { ...termDraft, endsOn: "2027-02-10" } }, "term-autumn");
    expect(JSON.stringify(state)).toBe(raw); expect(next.terms[0]).toMatchObject({ id: "term-autumn", yearId: "year-2026", revision: 2, endsOn: "2027-02-10" });
    expect(next.history.slice(0, 2)).toEqual(state.history);
    expect(next.history[2]).toMatchObject({ entity: "term", action: "updated", before: state.terms[0], after: next.terms[0] });
    next.history[2].before!.name = "Изменённая копия"; expect(state.terms[0].name).toBe(termDraft.name);
  });
  it("protects child terms when editing year boundaries", () => {
    const { state } = setup();
    expect(() => execute(state, { type: "update-year", yearId: "year-2026", entityRevision: 1, draft: { ...yearDraft, endsOn: "2026-12-31" } }, "year-2026")).toThrow("Границы года");
    const next = execute(state, { type: "update-year", yearId: "year-2026", entityRevision: 1, draft: { ...yearDraft, name: "Учебный год 2026/27" } }, "year-2026");
    expect(next.years[0].revision).toBe(2); expect(next.terms).toEqual(state.terms);
  });
  it.each(["unknown-action", "extra-field", "wrong-actor", "teacher", "blocked", "actor-revision", "document-revision", "entity-revision", "wrong-id", "unchanged"])("rejects invalid writes: %s", mode => {
    const { state } = setup(), acting = structuredClone(actor);
    const command = { actorId: actor.id, actorRevision: 1, expectedRevision: 2, type: "update-term", termId: "term-autumn", entityRevision: 1, draft: { ...termDraft, name: "Новый семестр" } };
    const metadata = { entityId: "term-autumn", eventId: "edit", occurredAt: time };
    if (mode === "unknown-action") command.type = "delete-term";
    if (mode === "extra-field") Object.assign(command, { yearId: "another-year" });
    if (mode === "wrong-actor") acting.id = "other";
    if (mode === "teacher") acting.role = "teacher";
    if (mode === "blocked") acting.status = "blocked";
    if (mode === "actor-revision") command.actorRevision++;
    if (mode === "document-revision") command.expectedRevision++;
    if (mode === "entity-revision") command.entityRevision++;
    if (mode === "wrong-id") metadata.entityId = "another-term";
    if (mode === "unchanged") command.draft = termDraft;
    expect(() => executeAcademicPeriodCommand(state, command as AcademicPeriodCommand, acting, metadata)).toThrow();
  });
  it.each(["before-time", "invalid-time", "duplicate-event", "invalid-id"])("rejects invalid audit metadata: %s", mode => {
    const { year } = setup(), metadata = { entityId: "term", eventId: "event-2", occurredAt: time };
    if (mode === "before-time") metadata.occurredAt = "2026-11-12T09:00:00.000Z";
    if (mode === "invalid-time") metadata.occurredAt = "2026-02-30T09:00:00.000Z";
    if (mode === "duplicate-event") metadata.eventId = "event-1";
    if (mode === "invalid-id") metadata.entityId = " invalid ";
    expect(() => executeAcademicPeriodCommand(year, { actorId: actor.id, actorRevision: 1, expectedRevision: 1, type: "create-term", yearId: "year-2026", draft: termDraft }, actor, metadata)).toThrow();
  });
  it.each(["version", "revision", "extra-field", "duplicate-year", "duplicate-term", "missing-event", "changed-snapshot", "wrong-before", "missing-parent", "moved-parent", "event-order", "event-actor"])("rejects corrupted persisted data: %s", mode => {
    const { state } = setup();
    const value = execute(state, { type: "update-term", termId: "term-autumn", entityRevision: 1, draft: { ...termDraft, name: "Переименованный семестр" } }, "term-autumn");
    if (mode === "version") Object.assign(value, { version: 2 });
    if (mode === "revision") value.revision++;
    if (mode === "extra-field") Object.assign(value.terms[0], { semester: 5 });
    if (mode === "duplicate-year") value.years.push(value.years[0]);
    if (mode === "duplicate-term") value.terms.push(value.terms[0]);
    if (mode === "missing-event") value.history.pop();
    if (mode === "changed-snapshot") value.terms[0].name = "Подменённое название";
    if (mode === "wrong-before") value.history[2].before!.name = "Чужое название";
    if (mode === "missing-parent") value.years = [];
    if (mode === "moved-parent") Object.assign(value.history[2].after, { yearId: "other-year" });
    if (mode === "event-order") [value.history[0], value.history[1]] = [value.history[1], value.history[0]];
    if (mode === "event-actor") value.history[2].actorId = "";
    expect(() => decodeAcademicPeriodsDocument(JSON.stringify(value))).toThrow();
  });
  it("does not infer historical authority from current account roles or introduce a student semester number", () => {
    const { state } = setup(); state.history[0].actorId = "old-configurator-with-no-current-account";
    const read = decodeAcademicPeriodsDocument(JSON.stringify(state));
    expect(read.terms[0]).not.toHaveProperty("semester"); expect(read.terms[0]).not.toHaveProperty("ordinal");
    expect(read.history[0].actorId).toBe("old-configurator-with-no-current-account");
  });
  it("reads an empty document and rejects malformed JSON, unsupported root fields and unbounded collections", () => {
    expect(decodeAcademicPeriodsDocument(JSON.stringify(emptyAcademicPeriodsDocument()))).toEqual(emptyAcademicPeriodsDocument());
    for (const value of ["broken", "null", JSON.stringify({ ...emptyAcademicPeriodsDocument(), programs: [] }), JSON.stringify({ ...emptyAcademicPeriodsDocument(), years: Array(1001).fill({}) })]) {
      expect(() => decodeAcademicPeriodsDocument(value)).toThrow();
    }
  });
});
