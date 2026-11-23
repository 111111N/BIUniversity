import { decodeAccountsDocument, type AccountsDocument } from "./accounts";
import { decodeGroupCatalog, type GroupCatalogDocument } from "./groupCatalog";
import { decodeSubjectCatalog, type SubjectCatalogDocument } from "./subjectCatalog";
import { decodeManagedSchedule, MANAGED_SCHEDULE_KEY, type ManagedScheduleSnapshot } from "./scheduleManagement";
import type { BaseSelectionDefinition } from "./backupBaseSelection";

function metadata(document: object, arrays: readonly string[]) {
  const result = { ...document } as Record<string, unknown>;
  for (const property of ["revision", ...arrays]) delete result[property];
  return result;
}
export const BACKUP_BASE_DOCUMENTS: readonly BaseSelectionDefinition[] = [
  { key: "bi-university-accounts-v1", prefix: "bi-university-accounts-", kind: "accounts", label: "Люди и учётные записи", decode: decodeAccountsDocument,
    collections: [
      { collection: "accounts", read: value => (value as AccountsDocument).accounts },
      { collection: "account-history", ordered: true, read: value => (value as AccountsDocument).history },
      { collection: "persons", read: value => (value as AccountsDocument).persons ?? [] },
      { collection: "person-history", ordered: true, read: value => (value as AccountsDocument).personHistory ?? [] },
      { collection: "education-events", ordered: true, read: value => (value as AccountsDocument).educationEvents ?? [] },
    ], metadata: value => metadata(value, ["accounts", "history", "persons", "personHistory", "educationEvents"]) },
  { key: "bi-university-group-catalog-v1", prefix: "bi-university-group-catalog-", kind: "groups", label: "Группы",
    decode: decodeGroupCatalog, collections: [{ collection: "groups", read: value => (value as GroupCatalogDocument).groups }, { collection: "group-history", ordered: true, read: value => (value as GroupCatalogDocument).history }], metadata: value => metadata(value, ["groups", "history"]) },
  { key: "bi-university-subject-catalog-v1", prefix: "bi-university-subject-catalog-", kind: "subjects", label: "Дисциплины",
    decode: decodeSubjectCatalog, collections: [{ collection: "subjects", read: value => (value as SubjectCatalogDocument).subjects }, { collection: "subject-history", ordered: true, read: value => (value as SubjectCatalogDocument).history }], metadata: value => metadata(value, ["subjects", "history"]) },
  { key: MANAGED_SCHEDULE_KEY, prefix: "bi-university-managed-schedule-", kind: "schedule", label: "Расписание и связи журнала",
    decode: raw => { const document = decodeManagedSchedule(raw); if (!document) throw new Error("Документ расписания повреждён."); return document; },
    collections: [
      { collection: "schedule-drafts", read: value => (value as ManagedScheduleSnapshot).drafts.flatMap(week => week.lessons) },
      { collection: "schedule-published", read: value => (value as ManagedScheduleSnapshot).published.flatMap(week => week.lessons) },
      { collection: "schedule-journal", read: value => (value as ManagedScheduleSnapshot).journal },
      { collection: "schedule-publications", ordered: true, read: value => (value as ManagedScheduleSnapshot).publications ?? [] },
    ], metadata: value => {
      const document = value as ManagedScheduleSnapshot;
      const weeks = (rows: ManagedScheduleSnapshot["drafts"]) => rows.map(week => { const copy = { ...week } as Partial<typeof week>; delete copy.lessons; return copy; });
      return { ...metadata(value, ["drafts", "published", "journal", "publications"]), drafts: weeks(document.drafts), published: weeks(document.published) };
    } },
];
