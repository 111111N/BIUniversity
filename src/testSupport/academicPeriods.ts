import { emptyAcademicPeriodsDocument, executeAcademicPeriodCommand } from "../domain/academicPeriods";
import type { PortalAccount } from "../domain/accounts";

export const academicPeriodsFixture = () => {
  const actor: PortalAccount = { id: "configurator-demo", login: "configurator", name: "Настройщик", role: "configurator", revision: 1, memberships: [] };
  const metadata = { entityId: "year-2026", eventId: "period-year-created", occurredAt: "2026-10-01T09:00:00.000Z" };
  const context = { actorId: actor.id, actorRevision: 1, expectedRevision: 0 };
  const year = executeAcademicPeriodCommand(emptyAcademicPeriodsDocument(), { ...context, type: "create-year", draft: { name: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-08-31" } }, actor, metadata);
  return executeAcademicPeriodCommand(year, { ...context, expectedRevision: 1, type: "create-term", yearId: "year-2026", draft: { name: "осенний семестр", startsOn: "2026-09-01", endsOn: "2027-01-31" } }, actor, { ...metadata, entityId: "term-autumn", eventId: "period-term-created" });
};
