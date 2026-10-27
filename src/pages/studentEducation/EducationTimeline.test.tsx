import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import EducationTimeline from "./EducationTimeline";
import type { StudentEducationEvent } from "../../domain/studentEducationEvent";

describe("linked education event details", () => {
  it("exposes the linked event's basis and document while keeping its original identity and batch destination", () => {
    const event: StudentEducationEvent = { id: "education:one", auditId: "audit:one", accountId: "student", actorId: "admin", accountRevisionAfter: 2, kind: "admitted", effectiveDate: "2026-10-26", registeredAt: "2026-10-27T09:00:00Z", basis: "Приказ о зачислении", documentNumber: "12-У", documentDate: "2026-10-26", batchId: "batch & one", after: { groupId: "group", groupName: "112-МКо", enrollment: "studying" } };
    const html = renderToStaticMarkup(<MemoryRouter><EducationTimeline events={[event]} accounts={[{ id: "admin", name: "Настройщик" }]} linkedId={event.id} remaining={0} total={1} onMore={() => {}} /></MemoryRouter>);
    expect(html).toContain('id="education:one"'); expect(html).toContain('aria-current="true"'); expect(html).toMatch(/<details[^>]*open=""/);
    expect(html).toContain("Приказ о зачислении"); expect(html).toContain("12-У"); expect(html).toContain("Настройщик");
    expect(html).toContain('/admin/students?batch=batch%20%26%20one');
  });
});
