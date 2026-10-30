import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { getDemoWeekSchedule } from "../../../data/schedule";
import type { Assignment } from "../../../data/assignmentStore";
import LessonDetails from ".";
import LessonOverview from "./Overview";

vi.mock("../../Modal", () => ({ default: ({ children, labelledBy }: { children: ReactNode; labelledBy: string }) => <section role="dialog" aria-labelledby={labelledBy}>{children}</section> }));
vi.mock("../../RoleContext", () => ({ useRole: () => ({ role: "teacher", currentUser: {
  id: "teacher-elena-volkova", name: "Елена Волкова", role: "teacher", scheduleName: "Волкова Е.В.",
  memberships: [{ subjectId: "theory-of-probability", groupIds: ["112-mko"] }],
} }) }));

describe("lesson details access", () => {
  it("does not mount the dialog for another teacher even in an assigned subject and group", () => {
    const item = { ...getDemoWeekSchedule(new Date(2026, 9, 5))[0], teacherId: "teacher-pavel-petrov", teacher: "Петров П.П." };
    const html = renderToStaticMarkup(<LessonDetails item={item} assignments={[]} assignmentError="PRIVATE read failure" onRetryAssignments={() => {}} onClose={() => {}} />);
    expect(html).toBe("");
  });
  it("keeps the existing journal, materials and assignment routes for an authorized lesson", () => {
    const item = getDemoWeekSchedule(new Date(2026, 9, 5))[0];
    const html = renderToStaticMarkup(<MemoryRouter><LessonDetails item={item} assignments={[]} onRetryAssignments={() => {}} onClose={() => {}} /></MemoryRouter>);
    expect(html).toContain('role="dialog"'); expect(html).toContain("Волкова Е.В.");
    expect(html).toContain('href="/journal/theory-of-probability/112-mko"');
    expect(html).toContain("Открыть материалы"); expect(html).toContain("Управление заданиями");
  });
  it("offers complete public metadata without academic content or links for a foreign short lesson", () => {
    const item = { ...getDemoWeekSchedule(new Date(2026, 9, 5))[0], teacherId: "another-teacher", teacher: "Другой преподаватель с длинной фамилией", endTime: "08:45" };
    const html = renderToStaticMarkup(<LessonOverview item={item} readOnly onClose={() => {}}><a href="/private">PRIVATE ASSIGNMENT</a></LessonOverview>);
    for (const text of [item.subject, "Только расписание", "08:30–08:45", "5 октября", "Ауд. 101", "112-МКо", item.teacher, "Закрыть занятие"]) expect(html).toContain(text);
    expect(html).toMatch(/aria-labelledby="([^"]+)"[\s\S]*<h2 id="\1"/);
    expect(html).not.toContain("<a "); expect(html).not.toContain("Задания"); expect(html).not.toContain("PRIVATE");
    expect(html).not.toContain("журнал"); expect(html).not.toContain("материалы");
  });
  it("shows explicit missing public fields without inventing a teacher or group", () => {
    const item = { ...getDemoWeekSchedule(new Date(2026, 9, 5))[0], teacher: undefined, group: undefined };
    const html = renderToStaticMarkup(<LessonOverview item={item} readOnly onClose={() => {}} />);
    expect(html).toContain("Не указана"); expect(html).toContain("Не указан");
    expect(html).not.toContain("undefined"); expect(html).not.toContain("Волкова");
  });
  it("shows a retryable assignment error without an empty-state claim or stale task links", () => {
    const item = getDemoWeekSchedule(new Date(2026, 9, 5))[0];
    const saved: Assignment = { id: "private-task", subjectId: "theory-of-probability", groupId: "112-mko", subject: item.subject, group: item.group!, title: "PRIVATE STALE TASK", description: "PRIVATE", lessonDate: `${item.date}T08:30`, lessonType: "Лекция", deadline: "2026-10-07T23:59", status: "published", allowLateSubmissions: false, createdAt: `${item.date}T07:00`, updatedAt: `${item.date}T07:00` };
    const html = renderToStaticMarkup(<MemoryRouter><LessonDetails item={item} assignments={[saved]} assignmentError="Не удалось прочитать список заданий." onRetryAssignments={() => {}} onClose={() => {}} /></MemoryRouter>);
    expect(html).toContain('role="alert"'); expect(html).toContain("Повторить загрузку");
    expect(html).toContain("Не удалось прочитать список заданий.");
    expect(html).not.toContain("Заданий пока нет"); expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("private-task");
    expect(html).not.toMatch(/Задания к занятию<\/h3><span/);
    expect(html).toMatch(/<h3[^>]+tabindex="-1"/);
    expect(html).toContain("08:30–10:00"); expect(html).toContain("Открыть журнал"); expect(html).toContain("Открыть материалы");
  });
  it("shows the confirmed empty state only after a successful list read", () => {
    const item = getDemoWeekSchedule(new Date(2026, 9, 5))[0];
    const html = renderToStaticMarkup(<MemoryRouter><LessonDetails item={item} assignments={[]} onRetryAssignments={() => {}} onClose={() => {}} /></MemoryRouter>);
    expect(html).toContain("Заданий пока нет"); expect(html).toContain("Задания к занятию</h3><span>0</span>");
    expect(html).not.toContain("Повторить загрузку"); expect(html).not.toContain('role="alert"');
  });
});
