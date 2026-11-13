import { describe, expect, it } from "vitest";
import type { AcademicPeriodsSnapshot } from "../../data/academicPeriodsStore";
import { refreshPeriodEditor, type PeriodEditor } from "./editorModel";

const fixture = () => {
  const year = { id: "year", revision: 1, name: "2026–2027", startsOn: "2026-09-01", endsOn: "2027-08-31" };
  const term = { id: "term", revision: 1, yearId: "year", name: "Осень", startsOn: "2026-09-01", endsOn: "2027-01-31" };
  const base: AcademicPeriodsSnapshot = { revision: 2, actorRevision: 1, years: [year], terms: [term] };
  const initial = { name: term.name, startsOn: term.startsOn, endsOn: term.endsOn };
  const editor: PeriodEditor = { entity: "term", id: term.id, yearId: year.id, base, source: term, initial, draft: { ...initial, name: "Мой несохранённый ввод" } };
  return { base, editor };
};
describe("reviewing a stale academic period editor", () => {
  it("preserves the draft and the captured target after an unrelated change", () => {
    const { base, editor } = fixture(), before = JSON.stringify(editor), latest = { ...base, revision: 3, actorRevision: 2 };
    const reviewed = refreshPeriodEditor(editor, latest);
    expect(reviewed.base).toBe(latest); expect(reviewed.draft.name).toBe("Мой несохранённый ввод"); expect(reviewed.source).toBe(editor.source); expect(JSON.stringify(editor)).toBe(before);
  });
  it.each(["target-revision", "target-name", "target-date", "removed-target", "removed-year", "moved-term"])("does not bless overwritten or unavailable targets: %s", mode => {
    const { base, editor } = fixture(), latest = structuredClone(base), before = JSON.stringify(editor); latest.revision++;
    if (mode === "target-revision") latest.terms[0].revision++;
    if (mode === "target-name") latest.terms[0].name = "Изменено в другой вкладке";
    if (mode === "target-date") latest.terms[0].endsOn = "2027-02-01";
    if (mode === "removed-target") latest.terms = [];
    if (mode === "removed-year") latest.years = [];
    if (mode === "moved-term") latest.terms[0].yearId = "other-year";
    expect(() => refreshPeriodEditor(editor, latest)).toThrow("Ввод сохранён"); expect(JSON.stringify(editor)).toBe(before);
  });
  it("does not infer a replacement year for an unsaved new term", () => {
    const { base, editor } = fixture(); delete editor.id; delete editor.source;
    expect(() => refreshPeriodEditor(editor, { ...base, years: [{ ...base.years[0], id: "other-year" }] })).toThrow();
  });
  it("can review a new year and an existing year without changing their draft", () => {
    const { base } = fixture(), year = base.years[0], initial = { name: year.name, startsOn: year.startsOn, endsOn: year.endsOn };
    const editor: PeriodEditor = { entity: "year", id: year.id, source: year, base, initial, draft: { ...initial, name: "Моё название" } };
    expect(refreshPeriodEditor(editor, { ...base, revision: 3 }).draft.name).toBe("Моё название");
    delete editor.id; delete editor.source; expect(refreshPeriodEditor(editor, { ...base, revision: 4, years: [] }).draft.name).toBe("Моё название");
  });
});
