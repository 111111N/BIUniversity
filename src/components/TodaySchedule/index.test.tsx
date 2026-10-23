import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import TodaySchedule from ".";

const session = vi.hoisted(() => ({ role: "teacher" }));
vi.mock("../RoleContext", () => ({ useRole: () => ({ ...session, currentUser: { id: session.role === "teacher" ? "teacher-elena-volkova" : "anna-smirnova", name: "", role: session.role, scheduleName: "Волкова Е.В.", memberships: [{ subjectId: "theory-of-probability", groupIds: ["112-mko"] }] } }) }));

describe("home schedule on a free day", () => {
  it.each(["teacher", "student"])("shows only the next teaching day link for %s", (role) => {
    session.role = role;
    const html = renderToStaticMarkup(<MemoryRouter><TodaySchedule date={new Date(2026, 9, 25)} /></MemoryRouter>);
    expect(html).toContain("Следующий учебный день");
    expect(html).toContain("/schedule?date=2026-10-26");
    expect(html).not.toContain("data-lesson-id");
    expect(html).not.toContain("занятий нет");
    expect(html).not.toContain("Можно уделить время");
  });
});
