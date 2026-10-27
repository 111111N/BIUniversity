import { isAccountActive, type PortalAccount } from "./accounts";
import { matchesSearchText } from "./search";

export interface TeacherRegistryQuery {
  q: string;
  subject: string;
  group: string;
  access: string;
  assignments: string;
  page: number;
}
export interface TeacherRegistryRow {
  accountId: string;
  name: string;
  login: string;
  email?: string;
  access: "active" | "blocked";
  subjectCount: number;
  groupCount: number;
  subjects: { id: string; name: string }[];
}
export interface TeacherRegistryResult {
  rows: TeacherRegistryRow[];
  total: number;
  totalTeachers: number;
  withoutAssignments: number;
  page: number;
  pages: number;
}
export const TEACHER_REGISTRY_PAGE_SIZE = 20;
const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

export const queryTeacherRegistry = (
  accounts: PortalAccount[],
  subjects: { id: string; name: string; shortName: string }[],
  groups: { id: string; name: string; previousNames?: string[] }[],
  query: TeacherRegistryQuery,
): TeacherRegistryResult => {
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  let totalTeachers = 0;
  let withoutAssignments = 0;
  const rows: TeacherRegistryRow[] = [];
  for (const account of accounts) {
    if (account.role !== "teacher") continue;
    totalTeachers++;
    const memberships = account.memberships.filter((entry) => entry.groupIds.length);
    if (!memberships.length) withoutAssignments++;
    const access = isAccountActive(account) ? "active" : "blocked";
    if (query.access !== "all" && access !== query.access) continue;
    if (query.assignments === "none" && memberships.length) continue;
    if (query.assignments === "assigned" && !memberships.length) continue;
    // Subject and group filters must match the same teaching assignment.
    if ((query.subject !== "all" || query.group !== "all") && !memberships.some((entry) =>
      (query.subject === "all" || entry.subjectId === query.subject) &&
      (query.group === "all" || entry.groupIds.includes(query.group)))) continue;
    const subjectIds = [...new Set(memberships.map((entry) => entry.subjectId))];
    const groupIds = [...new Set(memberships.flatMap((entry) => entry.groupIds))];
    const text = [account.name, account.login, account.email ?? "", account.scheduleName ?? "",
      ...subjectIds.map((id) => { const subject = subjectsById.get(id); return subject ? `${subject.name} ${subject.shortName}` : id; }),
      ...groupIds.map((id) => { const group = groupsById.get(id); return group ? `${group.name} ${(group.previousNames ?? []).join(" ")}` : id; }),
    ].join(" ");
    if (!matchesSearchText(text, query.q)) continue;
    rows.push({ accountId: account.id, name: account.name, login: account.login, email: account.email,
      access, subjectCount: subjectIds.length, groupCount: groupIds.length,
      subjects: subjectIds.slice(0, 3).map((id) => ({ id, name: subjectsById.get(id)?.name ?? id })),
    });
  }
  rows.sort((a, b) => collator.compare(a.name, b.name) || a.accountId.localeCompare(b.accountId));
  const pages = Math.max(1, Math.ceil(rows.length / TEACHER_REGISTRY_PAGE_SIZE));
  const page = Math.min(Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1, pages);
  return { rows: rows.slice((page - 1) * TEACHER_REGISTRY_PAGE_SIZE, page * TEACHER_REGISTRY_PAGE_SIZE), total: rows.length, totalTeachers, withoutAssignments, page, pages };
};
