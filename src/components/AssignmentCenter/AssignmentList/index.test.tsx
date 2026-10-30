import { createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Assignment } from "../../../data/assignmentStore";
import { indexAssignmentSubmissions } from "../../../domain/assignmentViews";
import AssignmentList from ".";

const task: Assignment = { id: "task-one", subjectId: "math", groupId: "group", subject: "Математика", group: "Группа", title: "Первая работа", description: "Условие", lessonDate: "2026-10-20T09:00", deadline: "2026-10-23T23:59", lessonType: "Практика", status: "published", allowLateSubmissions: false, createdAt: "2026-10-19T12:00", updatedAt: "2026-10-19T12:00" };
const defaults: ComponentProps<typeof AssignmentList> = {
  assignments: [task], indexes: indexAssignmentSubmissions([], "student"), role: "teacher", view: "current", query: "", sort: "deadline",
  now: new Date("2026-10-20T12:00"), showContext: false, listRef: createRef(),
  onView: () => {}, onQuery: () => {}, onSort: () => {}, onOpen: () => {}, onCreate: () => {},
};
const render = (props: Partial<ComponentProps<typeof AssignmentList>> = {}) => renderToStaticMarkup(<AssignmentList {...defaults} {...props} />);

describe("assignment list focus targets", () => {
  it("keeps the labelled list programmatically focusable without adding it to Tab order", () => {
    const markup = render();
    expect(markup).toMatch(/<section[^>]*tabindex="-1"[^>]*aria-label="Задания группы"/);
    expect(markup).toContain('data-assignment-open="task-one"');
    expect(markup).toContain('data-assignment-create="true"');
    expect(markup).toContain('type="search"');
  });

  it("keeps search and creation available when a filter excludes the opened task", () => {
    const markup = render({ query: "нет совпадений" });
    expect(markup).toContain("Задания не найдены");
    expect(markup).not.toContain("data-assignment-open=");
    expect(markup).toContain('type="search"');
    expect(markup).toContain('data-assignment-create="true"');
  });

  it("offers creation after the last task is removed", () => {
    const markup = render({ assignments: [] });
    expect(markup).toContain("Заданий пока нет");
    expect(markup).not.toContain('type="search"');
    expect(markup).toContain('data-assignment-create="true"');
  });

  it("offers the active filter for an empty student list without a teacher-only create action", () => {
    const markup = render({ assignments: [], role: "student", view: "todo" });
    expect(markup).toContain('aria-label="Мои задания"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain("data-assignment-create");
    expect(markup).not.toContain('type="search"');
  });
});
