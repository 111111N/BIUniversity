import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Assessment, AssessmentKind, AssessmentRecordBookMetadata } from "../../domain/assessmentTypes";
import { RecordBookContent } from "./index";

const entry = (id: string, kind: AssessmentKind, metadata: AssessmentRecordBookMetadata | null): Assessment => ({
  id, kind, title: `${id} название`, subjectId: "subject", subjectName: `${id} дисциплина`, groupId: "group", groupName: "112-МКО", period: "2026/27", supervisorId: null, recordBook: metadata, roster: [],
  attempts: [{ id: `${id}-attempt`, number: 1, kind: "primary", date: "2026-11-06", startsAt: "12:40", teacherId: "teacher", chairId: null, memberIds: [], studentIds: ["student"], results: [{ studentId: "student", outcome: kind === "pass" ? { status: "passed" } : { status: "graded", grade: 5 } }], state: "published", createdBy: "configurator", createdAt: "2026-11-05T09:00:00Z", publishedAt: "2026-11-06T10:00:00Z", publishedBy: "teacher" }],
});
const metadata = { semester: 1, hours: 72, category: "required" as const };
const render = (entries: Assessment[], search = "") => renderToStaticMarkup(<MemoryRouter initialEntries={[`/cabinet?tab=record-book${search}`]}><RecordBookContent assessments={entries} teachers={[{ id: "teacher", name: "Иванов Иван Иванович" }]} studentId="student" number="202610001" /></MemoryRouter>);
describe("student record book presentation", () => {
  it("renders pass and exam sections with all five requested columns and real values", () => {
    const html = render([entry("exam", "exam", metadata), entry("pass", "pass", metadata)]);
    for (const label of ["Зачёты", "Экзамены", "Название", "Часы", "Дата и время", "Оценка", "Преподаватель", "72", "12:40", "06.11.2026", "Иванов Иван Иванович", "Зачтено", "202610001"]) expect(html).toContain(label);
    expect(html.match(/role="table"/g)).toHaveLength(2);
    expect(html).toContain('dateTime="2026-11-06T12:40:00+03:00"');
    expect(html).toContain('/assessments/exam');
  });
  it("switches the entire visible semester by the URL and defaults to the last known semester", () => {
    const entries = [entry("first", "exam", metadata), entry("second", "exam", { ...metadata, semester: 2 })];
    expect(render(entries)).toContain("second дисциплина"); expect(render(entries)).not.toContain("first дисциплина");
    expect(render(entries, "&semester=1")).toContain("first дисциплина"); expect(render(entries, "&semester=1")).not.toContain("second дисциплина");
  });
  it("keeps practices, coursework, electives and theses in separate named sections", () => {
    const html = render([entry("practice", "internship", metadata), entry("course", "coursework", metadata), entry("elective", "exam", { ...metadata, category: "elective" }), entry("thesis", "thesis", metadata)]);
    for (const label of ["Практики", "Курсовые работы", "Факультативы", "ВКР"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain("elective дисциплина"); expect(html.match(/role="table"/g)).toHaveLength(4);
  });
  it("does not label missing metadata as first semester or invent seventy-two hours", () => {
    const html = render([entry("legacy", "exam", null)]);
    expect(html).toContain("Семестр не указан"); expect(html).toContain("семестр и часы ещё не указаны");
    expect(html).toContain('data-label="Часы">—</td>'); expect(html).not.toContain("1 семестр");
  });
  it("shows an honest empty book until personal results are published", () => {
    const draft = entry("draft", "exam", metadata); draft.attempts[0].state = "draft";
    const html = render([draft]);
    expect(html).toContain("Зачётка пока пуста"); expect(html).not.toContain("draft дисциплина"); expect(html).not.toContain('role="table"');
  });
});
