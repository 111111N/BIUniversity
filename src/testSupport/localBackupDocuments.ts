import type { AccountsDocument } from "../domain/accounts";
import type { GroupCatalogDocument } from "../domain/groupCatalog";
import type { SubjectCatalogDocument } from "../domain/subjectCatalog";
import type { ManagedScheduleSnapshot } from "../domain/scheduleManagement";
import { BACKUP_CORE_DOCUMENTS, type BackupDocumentKind } from "../domain/localBackupDocuments";
import { backupFixture, backupTime } from "./localBackup";

export const coreBackupFixture = () => {
  const accounts: AccountsDocument = { version: 1, revision: 1, history: [], accounts: [
    { id: "configurator-demo", name: "Настройщик системы", login: "configurator", role: "configurator", revision: 1, memberships: [] },
    { id: "teacher-1", name: "Иван Петров", login: "teacher", role: "teacher", revision: 1, memberships: [{ subjectId: "subject-1", groupIds: ["group-1"] }] },
    { id: "student-1", name: "Анна Смирнова", login: "student", role: "student", revision: 1, studentGroupId: "group-1", memberships: [{ subjectId: "subject-1", groupIds: ["group-1"] }] },
  ] };
  const groups: GroupCatalogDocument = { version: 1, revision: 1, history: [], groups: [{ id: "group-1", name: "101-ИВТ", course: 1, campus: 1, admissionYear: 2026, revision: 1, createdAt: backupTime, createdBy: "configurator-demo" }] };
  const subjects: SubjectCatalogDocument = { version: 1, revision: 1, history: [], subjects: [{ id: "subject-1", name: "Математика", shortName: "МАТ", semester: "", color: "red" }] };
  const schedule: ManagedScheduleSnapshot = { version: 1, revision: 1, published: [], journal: [], drafts: [{ weekStart: "2026-10-26", groupId: "group-1", lessons: [{
    id: "managed:lesson-1", scheduleId: 1, subjectId: "subject-1", groupId: "group-1", teacherId: "teacher-1", teacherName: "Петров И.П.", date: "2026-10-28", startsAt: "09:00", endsAt: "10:30", type: "practice", room: "101",
  }] }] };
  const archive = backupFixture();
  const documents = { accounts, groups, subjects, schedule };
  const save = () => { archive.localStorage = (Object.entries(documents) as [BackupDocumentKind, unknown][]).map(([kind, value]) => ({ key: BACKUP_CORE_DOCUMENTS[kind].key, raw: JSON.stringify(value) })); archive.totals.storageEntries = archive.localStorage.length; return archive; };
  save(); return { archive, accounts, groups, subjects, schedule, save };
};
