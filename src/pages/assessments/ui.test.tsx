import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Assessment, AssessmentSnapshot } from "../../domain/assessmentTypes";
import AttemptResults from "./AttemptResults";
import SelectionList from "./SelectionList";
import AssessmentDetails from "./AssessmentDetails";
import ResultEditor from "./ResultEditor";
import AssessmentForm from "./AssessmentForm";
import AssessmentCatalogCard from "./AssessmentCatalogCard";
import OutcomeBadge from "./OutcomeBadge";
import gradeStyles from "../../components/AssignmentCenter/SubmissionResult/index.module.scss";
import styles from "./index.module.scss";

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
  it("reuses assignment grade styling for every numeric outcome", () => {
    for (const grade of [2, 3, 4, 5] as const) {
      const html = renderToStaticMarkup(<OutcomeBadge outcome={{ status: "graded", grade }} />);
      expect(html).toContain(styles.compactGrade);
      if (grade !== 5) expect(html).toContain(gradeStyles[`grade_${grade}`]);
      expect(html).toContain(`aria-label="Оценка ${grade}"`);
    }
  });
  it("distinguishes pass, fail and unrecorded outcomes", () => {
    expect(renderToStaticMarkup(<OutcomeBadge outcome={{ status: "passed" }} />)).toContain(styles.passed);
    expect(renderToStaticMarkup(<OutcomeBadge outcome={{ status: "failed" }} />)).toContain(styles.failed);
    for (const outcome of [null, { status: "absent" } as const]) {
      expect(renderToStaticMarkup(<OutcomeBadge outcome={outcome} />)).toContain(styles.pending);
    }
  });
  it("renders a shared catalog card with personal outcome and an isolated example link", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AssessmentCatalogCard assessment={{ ...assessment, attempts: [{ ...assessment.attempts[0], state: "published" }] }} actorId="student" student example /></MemoryRouter>);
    expect(html).toContain("<article"); expect(html).toContain('href="/assessments/assessment?example=1"');
    expect(html).toContain("Последняя попытка"); expect(html).toContain("Не указан"); expect(html).toContain(">2</strong>");
    expect(html).not.toContain("Анна Смирнова"); expect(html).not.toContain("Черновик");
  });
  it("keeps the staff catalog state separate from personal results", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AssessmentCatalogCard assessment={assessment} actorId="teacher" /></MemoryRouter>);
    expect(html).toContain("Предстоит"); expect(html).toContain("Открыть ведомости"); expect(html).not.toContain("?example=1");
  });
  it("keeps the result of two visible as a failing grade without changing it to absence", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AttemptResults assessment={assessment} attempt={assessment.attempts[0]} /></MemoryRouter>);
    expect(html).toContain("Анна Смирнова"); expect(html).toContain("202610001"); expect(html).toContain('>2</span>'); expect(html).not.toContain("Неявка"); expect(html).not.toContain("<select");
  });
  it("labels a projected student result without exposing an editing control", () => {
    const html = renderToStaticMarkup(<AttemptResults assessment={assessment} attempt={assessment.attempts[0]} student />);
    expect(html).toContain("Ваш результат"); expect(html).not.toContain("Анна Смирнова"); expect(html).not.toContain("202610001"); expect(html).not.toContain("<select");
  });
  it("keeps lists collapsed, links profiles and omits single-page counters", () => {
    const html = details("teacher");
    expect(html).toContain('href="/students/student"');
    expect(html).toContain('href="/teachers/teacher"');
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).not.toContain("1 / 1");
    expect(html).not.toContain("Опубликованная попытка доступна только для просмотра.");
  });
  it("shows upcoming and awaiting-publication states without draft grades", () => {
    expect(details("student")).toContain("Предстоит");
    expect(details("student")).not.toContain('aria-label="Оценка 2"');
    vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
    expect(details("student")).toContain("Ожидается результат");
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
  it("shows structured record details and completion only to staff", () => {
    const staff = details("teacher");
    expect(staff).toContain("Навигация по аттестациям"); expect(staff).toContain("Объём программы");
    expect(staff).toContain("История попыток"); expect(staff).toContain('<progress');
    expect(details("student")).not.toContain('<progress');
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
