import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleProvider } from "../../RoleContext";
import { getDemoWeekSchedule } from "../../../data/schedule";
import LessonDetails from ".";

describe("lesson details access", () => {
  it("does not mount the dialog for another teacher even in an assigned subject and group", () => {
    const item = { ...getDemoWeekSchedule(new Date(2026, 9, 5))[0], teacherId: "teacher-pavel-petrov", teacher: "Петров П.П." };
    const html = renderToStaticMarkup(<RoleProvider><LessonDetails item={item} assignments={[]} onClose={() => {}} /></RoleProvider>);
    expect(html).toBe("");
  });
});
