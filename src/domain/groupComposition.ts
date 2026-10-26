import { getStudentGroupId, type PortalAccount, type UserRole } from "./accounts";
import { getMoscowDateKey, isEducationDate, type EducationEventKind, type StudentEducationEvent } from "./studentEducationEvent";
import type { StudentEnrollmentStatus } from "./studentEnrollment";
import type { RegistryGroup } from "./studentRegistry";
import { matchesSearchText } from "./search";

export const GROUP_COMPOSITION_PAGE_SIZE = 20;
export type GroupCompositionView = "studying" | "completed" | "unknown";
export interface GroupCompositionQuery { groupId: string; date: string; view: GroupCompositionView; q: string; page: number }
export interface GroupCompositionRow {
  accountId: string;
  name: string;
  login: string;
  email?: string;
  studentNumber?: string;
  currentRole: UserRole;
  knowledge: "confirmed" | "unknown";
  enrollment?: StudentEnrollmentStatus;
  source?: { id: string; kind: EducationEventKind; effectiveDate: string };
  unknownReason?: "no-history" | "before-history";
  firstEventDate?: string;
}
export interface GroupCompositionResult {
  groupId: string;
  date: string;
  rows: GroupCompositionRow[];
  counts: Record<GroupCompositionView, number>;
  total: number;
  page: number;
  pages: number;
}
export interface GroupCompositionSnapshot extends GroupCompositionResult { accountsRevision: number; groupRevision: number; groupNameAtDate: string }
const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

/** The effective state is the last event of the Moscow calendar day, including same-day changes. */
export const queryGroupComposition = (accounts: PortalAccount[], events: StudentEducationEvent[], groups: RegistryGroup[], query: GroupCompositionQuery, registeredAt = new Date().toISOString()): GroupCompositionResult => {
  if (!query || !isEducationDate(query.date) || query.date > getMoscowDateKey(registeredAt)) throw new Error("Для состава выберите корректную дату: сегодня или прошедший день.");
  if (!groups.some((group) => group.id === query.groupId)) throw new Error("Группа недоступна. Найдите её в справочнике групп.");
  if (!["studying", "completed", "unknown"].includes(query.view) || typeof query.q !== "string") throw new Error("Выберите допустимый список состава группы.");
  const first = new Map<string, StudentEducationEvent>();
  const atDate = new Map<string, StudentEducationEvent>();
  const related = new Set<string>();
  // The stored event stream is validated on read; one pass avoids scanning the full history per student.
  for (const event of events) {
    if (!first.has(event.accountId)) first.set(event.accountId, event);
    if (event.effectiveDate <= query.date) atDate.set(event.accountId, event);
    if (event.before?.groupId === query.groupId || event.after.groupId === query.groupId) related.add(event.accountId);
  }
  const counts = { studying: 0, completed: 0, unknown: 0 };
  const rows: GroupCompositionRow[] = [];
  for (const account of accounts) {
    const event = atDate.get(account.id);
    const firstEvent = first.get(account.id);
    if (event ? event.after.groupId !== query.groupId : getStudentGroupId(account) !== query.groupId && !related.has(account.id)) continue;
    const view: GroupCompositionView = event ? event.after.enrollment === "studying" ? "studying" : "completed" : "unknown";
    counts[view]++;
    if (query.view !== view || !matchesSearchText(`${account.name} ${account.login} ${account.email ?? ""} ${account.studentRecord?.number ?? ""}`, query.q)) continue;
    rows.push({ accountId: account.id, name: account.name, login: account.login, email: account.email, studentNumber: account.studentRecord?.number, currentRole: account.role,
      knowledge: event ? "confirmed" : "unknown",
      ...(event ? { enrollment: event.after.enrollment, source: { id: event.id, kind: event.kind, effectiveDate: event.effectiveDate } } : { unknownReason: firstEvent ? "before-history" : "no-history", ...(firstEvent ? { firstEventDate: firstEvent.effectiveDate } : {}) }),
    });
  }
  rows.sort((a, b) => collator.compare(a.name, b.name) || a.accountId.localeCompare(b.accountId));
  const pages = Math.max(1, Math.ceil(rows.length / GROUP_COMPOSITION_PAGE_SIZE));
  const page = Math.min(Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1, pages);
  return { groupId: query.groupId, date: query.date, counts, total: rows.length, page, pages, rows: rows.slice((page - 1) * GROUP_COMPOSITION_PAGE_SIZE, page * GROUP_COMPOSITION_PAGE_SIZE) };
};
