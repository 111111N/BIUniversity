import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Assessment, AssessmentSnapshot } from "../../domain/assessmentTypes";
import AttemptResults from "./AttemptResults";
import SelectionList from "./SelectionList";
import AssessmentDetails from "./AssessmentDetails";
import ResultEditor from "./ResultEditor";
import AssessmentForm from "./AssessmentForm";

vi.mock("../../components/UnsavedChangesProvider", () => ({ useUnsavedChangesGuard: () => ({ requestAction: (action: () => void) => action() }) }));
vi.mock("../../hooks/useUnsavedChangesWarning", () => ({ default: () => undefined }));

const assessment: Assessment = {
  id: "assessment", title: "Экзамен по математике", kind: "exam", groupId: "group", groupName: "112-МКО", subjectId: "subject", subjectName: "Математика", period: "2026/27", supervisorId: null, recordBook: null,
  roster: [{ studentId: "student", name: "Анна Смирнова", studentNumber: "202610001" }],
  attempts: [{ id: "attempt", number: 1, kind: "primary", date: "2026-11-06", startsAt: "12:00", teacherId: "teacher", chairId: null, memberIds: [], studentIds: ["student"], results: [{ studentId: "student", outcome: { status: "graded", grade: 2 } }], state: "draft", createdAt: "2026-11-05T09:00:00Z", createdBy: "configurator", publishedAt: null, publishedBy: null }],
};
const snapshot: AssessmentSnapshot = { revision: 1, accountsRevision: 1, groupRevision: 1, subjectRevision: 1, actorRevision: 1, assessments: [assessment], groups: [{ id: "group", name: "112-МКО" }], subjects: [{ id: "subject", name: "Математика" }], teachers: [{ id: "teacher", name: "Елена Волкова" }], students: [{ ...assessment.roster[0], groupId: "group" }] };
const noop = () => undefined;
const details = (role: "teacher" | "student" | "configurator", blocked = false) => renderToStaticMarkup(<MemoryRouter><AssessmentDetails assessment={assessment} snapshot={snapshot} actorId={role === "teacher" ? "teacher" : role} role={role} blocked={blocked} refresh={noop} onMessage={noop} /></MemoryRouter>);
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-06T08:59:59Z")); });
afterEach(() => { vi.useRealTimers(); });

describe("assessment workspace presentation", () => {
  it("keeps the result of two visible as a failing grade without changing it to absence", () => {
    const html = renderToStaticMarkup(<AttemptResults assessment={assessment} attempt={assessment.attempts[0]} />);
    expect(html).toContain("Анна Смирнова"); expect(html).toContain("202610001"); expect(html).toContain('>2</span>'); expect(html).not.toContain("Неявка"); expect(html).not.toContain("<select");
  });
  it("labels a projected student result without exposing an editing control", () => {
    const html = renderToStaticMarkup(<AttemptResults assessment={assessment} attempt={assessment.attempts[0]} student />);
    expect(html).toContain("Ваш результат"); expect(html).not.toContain("Анна Смирнова"); expect(html).not.toContain("202610001"); expect(html).not.toContain("<select");
  });
  it("limits participant rows to twenty even if a group has hundreds of people", () => {
    const options = Array.from({ length: 105 }, (_, id) => ({ id: String(id), name: `Студент ${id}` }));
    const html = renderToStaticMarkup(<SelectionList label="Участники ведомости" options={options} value={options.map((item) => item.id)} onChange={noop} />);
    expect(html.match(/type="checkbox"/g)).toHaveLength(20); expect(html).toContain("Выбрано: 105"); expect(html).toContain("1 / 6"); expect(html).toContain('placeholder=""');
  });
  it("allows reading before the appointed Moscow time but disables publication", () => {
    const html = details("teacher");
    expect(html).toContain("Просмотреть ведомость"); expect(html).toContain("12:00 (Москва)"); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Опубликовать<\/button>/);
    vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
    const opened = details("teacher"); expect(opened).toContain("Заполнить ведомость"); expect(opened).not.toMatch(/<button[^>]*disabled=""[^>]*>Опубликовать<\/button>/);
  });
  it("keeps result controls disabled before the appointment even when a saved result exists", () => {
    const html = renderToStaticMarkup(<ResultEditor actorId="teacher" snapshot={snapshot} assessment={assessment} attempt={assessment.attempts[0]} blocked={false} onClose={noop} onSaved={noop} refresh={noop} />);
    expect(html).toContain("Сейчас доступен просмотр"); expect(html).toMatch(/<select[^>]*disabled=""/); expect(html).toContain('value="2" selected=""'); expect(html).not.toContain('value="1"'); expect(html).toContain('value="absent"');
  });
  it("blocks controls while the current source is being rechecked", () => {
    vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
    expect(details("teacher", true)).toMatch(/<button[^>]*disabled=""[^>]*>Опубликовать<\/button>/);
    const html = renderToStaticMarkup(<ResultEditor actorId="teacher" snapshot={snapshot} assessment={assessment} attempt={assessment.attempts[0]} blocked onClose={noop} onSaved={noop} refresh={noop} />);
    expect(html).toMatch(/<select[^>]*disabled=""/);
  });
  it("keeps configuring and filling a statement separate", () => {
    const html = details("configurator"); expect(html).toContain("Добавить пересдачу"); expect(html).not.toContain("Заполнить ведомость"); expect(html).not.toContain(">Опубликовать</button>");
  });
  it("pins the supervisor for subsequent thesis attempts and explains cohort assignment", () => {
    const thesis = { ...assessment, kind: "thesis" as const, supervisorId: "teacher" };
    const html = renderToStaticMarkup(<AssessmentForm actorId="configurator" snapshot={snapshot} assessment={thesis} blocked={false} onClose={noop} onSaved={noop} refresh={noop} />);
    expect(html).toContain("Научный руководитель"); expect(html).toContain("Елена Волкова"); expect(html).toContain("На всех попытках ведомость заполняет закреплённый научный руководитель"); expect(html).toContain("Время (Москва)");
  });
});
