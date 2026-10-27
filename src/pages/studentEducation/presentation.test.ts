import { describe, expect, it } from "vitest";
import { educationSectionSearch, getEducationSection, getEducationTimeline, hasAdmissionChanges } from "./presentation";
import type { StudentEducationEvent } from "../../domain/studentEducationEvent";

const events: StudentEducationEvent[] = Array.from({ length: 50 }, (_, index) => ({ id: `education:${index}`, accountId: "student", actorId: "admin", registeredAt: "2026-10-27T09:00:00Z", effectiveDate: "2026-10-27", basis: `Основание ${index}`, kind: "admitted", after: { groupId: "group", groupName: "112-МКо", enrollment: "studying" }, accountRevisionAfter: index + 2, auditId: `audit:${index}` }));
describe("education workspace navigation", () => {
  it("protects actual admission input while treating cleared optional document fields as an unchanged empty form", () => {
    const baseline = { effectiveDate: "2026-10-27", basis: "" };
    expect(hasAdmissionChanges({ ...baseline, documentNumber: "", documentDate: "" }, baseline)).toBe(false);
    expect(hasAdmissionChanges({ ...baseline, basis: "Приказ о зачислении" }, baseline)).toBe(true);
    expect(hasAdmissionChanges({ ...baseline, effectiveDate: "2026-09-01" }, baseline)).toBe(true);
    expect(hasAdmissionChanges({ ...baseline, documentNumber: "12-У" }, baseline)).toBe(true);
    expect(hasAdmissionChanges({ ...baseline, documentDate: "2026-09-01" }, baseline)).toBe(true);
  });
  it("opens a linked old event even when the requested section is periods", () => {
    const source = new URLSearchParams("view=periods&from=history");
    expect(getEducationSection(source, "#education:1")).toBe("events");
    const result = getEducationTimeline(events, 20, "#education:1");
    expect(result).toMatchObject({ linkedId: "education:1", remaining: 29 });
    expect(result.shown).toHaveLength(21); expect(result.shown.at(-1)).toBe(events[1]);
    expect(result.shown.at(-1)?.basis).toBe("Основание 1");
    expect(events[0].id).toBe("education:0"); expect(events).toHaveLength(50);
  });
  it("does not duplicate an already visible linked event or invent a missing event", () => {
    const visible = getEducationTimeline(events, 20, "#education:40");
    expect(visible.shown).toHaveLength(20); expect(visible.remaining).toBe(30);
    expect(visible.shown.filter((event) => event.id === "education:40")).toHaveLength(1);
    expect(getEducationTimeline(events, 20, "#other-student-event")).toMatchObject({ linkedId: undefined, missingLinkedEvent: true, remaining: 30 });
    expect(getEducationTimeline([], 20, "")).toMatchObject({ shown: [], missingLinkedEvent: false, remaining: 0 });
    expect(getEducationTimeline(events, 100, "").shown).toHaveLength(50);
  });
  it("preserves unrelated URL context when switching sections and keeps existing event links compatible", () => {
    const source = new URLSearchParams("from=history");
    const dated = educationSectionSearch(source, "dated");
    expect(getEducationSection(dated, "")).toBe("dated"); expect(dated.get("from")).toBe("history");
    expect(getEducationSection(educationSectionSearch(dated, "periods"), "")).toBe("periods");
    expect(educationSectionSearch(dated, "events").toString()).toBe(source.toString());
    expect(getEducationSection(new URLSearchParams("view=unknown"), "")).toBe("events");
    expect(source.has("view")).toBe(false);
  });
});
