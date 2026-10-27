import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AccountHistory from "./AccountHistory";
import type { AccountChange } from "../../domain/accounts";

describe("account audit history", () => {
  it("does not turn unreadable history into an empty history", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AccountHistory accountId="student" entries={[]} accounts={[]} unavailable requestedPage={null} onPage={() => {}} /></MemoryRouter>);
    expect(html).toContain("История временно недоступна"); expect(html).not.toContain("Изменений пока нет"); expect(html).not.toContain("Событий: 0");
  });
  it("preserves corrective links and before/after values without making the audit card an editor", () => {
    const entry: AccountChange = { id: "audit", accountId: "student & one", actorId: "admin", action: "details-changed", occurredAt: "2026-10-27T09:00:00Z", previousRole: "student", nextRole: "student", changes: [{ field: "email", before: "old@example.test", after: "new@example.test" }], educationEventId: "education:one", studentOperationBatchId: "batch & one", importBatchId: "import & one" };
    const html = renderToStaticMarkup(<MemoryRouter><AccountHistory accountId={entry.accountId} entries={[entry]} accounts={[{ id: "admin", name: "Настройщик" }]} unavailable={false} requestedPage={null} onPage={() => {}} /></MemoryRouter>);
    expect(html).toContain("old@example.test"); expect(html).toContain("new@example.test"); expect(html).toContain("Настройщик");
    expect(html).toContain('/admin/students/student%20%26%20one/education#education:one');
    expect(html).toContain('/admin/students?batch=batch%20%26%20one'); expect(html).toContain('/admin/accounts/import?batch=import%20%26%20one');
    expect(html).not.toContain("<input"); expect(html).not.toMatch(/<details[^>]*open=/);
  });
});
