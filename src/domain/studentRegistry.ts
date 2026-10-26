import { getStudentGroupId, isAccountActive, type PortalAccount } from "./accounts";
import { matchesSearchText } from "./search";
import type { GroupStatus } from "./groupCatalog";
import { STUDENT_ENROLLMENT_LABELS, type StudentEnrollmentStatus } from "./studentEnrollment";

export interface RegistryGroup { id: string; name: string; status?: GroupStatus; previousNames?: string[] }
export interface StudentRegistryQuery { q: string; group: string; enrollment: string; access: string; campus: string; year: string; sort: string; page: number }
export interface StudentRegistryRow { accountId: string; revision: number; name: string; login: string; email?: string; groupId?: string; groupName: string; groupArchived: boolean; enrollment: StudentEnrollmentStatus; access: "active" | "blocked"; studentNumber?: string; campus?: number; year?: number }
export interface StudentRegistryResult { rows: StudentRegistryRow[]; total: number; totalStudents: number; page: number; pages: number; years: number[] }
export const REGISTRY_PAGE_SIZE = 20;
const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });
export const queryStudentRegistry = (accounts: PortalAccount[], groups: RegistryGroup[], query: StudentRegistryQuery): StudentRegistryResult => {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const students = accounts.filter((account) => account.role === "student");
  const years = [...new Set(students.flatMap((account) => account.studentRecord ? [account.studentRecord.year] : []))].sort((a, b) => b - a);
  const rows = students.flatMap((account): StudentRegistryRow[] => {
    const groupId = getStudentGroupId(account); const group = byId.get(groupId ?? "");
    const enrollment = account.enrollmentStatus ?? "studying"; const access = isAccountActive(account) ? "active" : "blocked";
    if ((query.group !== "all" && groupId !== query.group) || (query.enrollment !== "all" && enrollment !== query.enrollment) || (query.access !== "all" && access !== query.access)) return [];
    if (query.campus !== "all" && (query.campus === "unknown" ? Boolean(account.studentRecord) : String(account.studentRecord?.campus) !== query.campus)) return [];
    if (query.year !== "all" && (query.year === "unknown" ? Boolean(account.studentRecord) : String(account.studentRecord?.year) !== query.year)) return [];
    if (!matchesSearchText(`${account.name} ${account.login} ${account.email ?? ""} ${account.studentRecord?.number ?? ""} ${group?.name ?? ""} ${(group?.previousNames ?? []).join(" ")} ${STUDENT_ENROLLMENT_LABELS[enrollment]}`, query.q)) return [];
    return [{ accountId: account.id, revision: account.revision, name: account.name, login: account.login, email: account.email, groupId, groupName: group?.name ?? "Группа недоступна", groupArchived: group?.status === "archived", enrollment, access, studentNumber: account.studentRecord?.number, campus: account.studentRecord?.campus, year: account.studentRecord?.year }];
  });
  rows.sort((a, b) => { const value = query.sort === "group" ? collator.compare(a.groupName, b.groupName) : query.sort === "number" ? collator.compare(a.studentNumber ?? "я", b.studentNumber ?? "я") : collator.compare(a.name, b.name); return value || collator.compare(a.name, b.name) || a.accountId.localeCompare(b.accountId); });
  const pages = Math.max(1, Math.ceil(rows.length / REGISTRY_PAGE_SIZE)); const page = Math.min(Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1, pages);
  return { rows: rows.slice((page - 1) * REGISTRY_PAGE_SIZE, page * REGISTRY_PAGE_SIZE), total: rows.length, totalStudents: students.length, page, pages, years };
};
