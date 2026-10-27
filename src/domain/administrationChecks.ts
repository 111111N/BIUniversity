import { getStudentGroupId, isAccountActive, type PortalAccount } from "./accounts";
import { isStudyingStudent } from "./studentEnrollment";
import { isGroupActive, type GroupStatus } from "./groupCatalog";
import { matchesSearchText } from "./search";
import type { ManagedScheduleWeek } from "./scheduleManagement";

export const ADMINISTRATION_CHECK_LABELS = {
  "empty-group": "Группы без внесённых учащихся",
  "unassigned-subject": "Дисциплины без действующих назначений",
  "student-number": "Учащиеся без номера зачетки",
  "published-lesson": "Опубликованные пары с недоступными данными",
};
export type AdministrationIssueKind = keyof typeof ADMINISTRATION_CHECK_LABELS;
export type AdministrationIssueLevel = "action" | "review";
export interface AdministrationChecksQuery { q: string; kind: string; level: string; page: number }
export interface AdministrationIssue {
  id: string;
  kind: AdministrationIssueKind;
  level: AdministrationIssueLevel;
  title: string;
  detail: string;
  groupId?: string;
  groupArchived?: boolean;
  subjectId?: string;
  accountId?: string;
  weekStart?: string;
  lessonDate?: string;
}
export interface AdministrationChecksResult {
  rows: AdministrationIssue[];
  total: number;
  page: number;
  pages: number;
  checkedAt: string;
  counts: Record<AdministrationIssueLevel, number>;
  kinds: Record<AdministrationIssueKind, number>;
}
interface CheckGroup { id: string; name: string; status?: GroupStatus }
interface CheckSubject { id: string; name: string; shortName: string }
export const ADMINISTRATION_CHECK_PAGE_SIZE = 20;
const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

export const queryAdministrationChecks = (
  accounts: PortalAccount[], groups: CheckGroup[], subjects: CheckSubject[], published: ManagedScheduleWeek[],
  query: AdministrationChecksQuery, now: string,
): AdministrationChecksResult => {
  const instant = Date.parse(now);
  if (!Number.isFinite(instant)) throw new Error("Не удалось определить время проверки данных.");
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const populatedGroups = new Set<string>();
  const assignedSubjects = new Set<string>();
  const assignments = new Map<string, Map<string, Set<string>>>();
  const issues: AdministrationIssue[] = [];
  for (const account of accounts) {
    if (isStudyingStudent(account)) {
      const groupId = getStudentGroupId(account);
      if (groupId) populatedGroups.add(groupId);
      if (!account.studentRecord) issues.push({ id: `student-number:${account.id}`, kind: "student-number", level: "action", title: account.name, detail: `${account.login} · ${account.email ?? "Почта не указана"} · ${groupsById.get(groupId ?? "")?.name ?? "Группа недоступна"}. Номер зачетки не выдан.`, accountId: account.id, groupId });
    }
    if (account.role !== "teacher") continue;
    const teaching = new Map<string, Set<string>>();
    for (const membership of account.memberships) {
      teaching.set(membership.subjectId, new Set(membership.groupIds));
      if (isAccountActive(account) && membership.groupIds.some((id) => { const group = groupsById.get(id); return group && isGroupActive(group); })) assignedSubjects.add(membership.subjectId);
    }
    assignments.set(account.id, teaching);
  }
  for (const group of groups) if (isGroupActive(group) && !populatedGroups.has(group.id)) issues.push({ id: `empty-group:${group.id}`, kind: "empty-group", level: "review", title: group.name, detail: "Нет внесённых студентов в состоянии «Учится». Проверьте состав группы или добавьте учащихся.", groupId: group.id });
  for (const subject of subjects) if (!assignedSubjects.has(subject.id)) issues.push({ id: `unassigned-subject:${subject.id}`, kind: "unassigned-subject", level: "review", title: subject.name, detail: `${subject.shortName} · Нет активного преподавателя с назначением на действующую группу. Проверьте назначения, если дисциплина используется.`, subjectId: subject.id });
  for (const week of published) for (const lesson of week.lessons) {
    // Published lesson times are interpreted in the university's Moscow timezone.
    if (Date.parse(`${lesson.date}T${lesson.endsAt}:00+03:00`) <= instant) continue;
    const teacher = accountsById.get(lesson.teacherId);
    const group = groupsById.get(lesson.groupId);
    const subject = subjectsById.get(lesson.subjectId);
    const reasons: string[] = [];
    if (!teacher || teacher.role !== "teacher") reasons.push("Учётная запись преподавателя недоступна или её тип изменён");
    else if (!isAccountActive(teacher)) reasons.push("Доступ преподавателя заблокирован");
    else if (!assignments.get(teacher.id)?.get(lesson.subjectId)?.has(lesson.groupId)) reasons.push("Преподаватель больше не назначен на эту дисциплину и группу");
    if (!group || !isGroupActive(group)) reasons.push("Группа недоступна или находится в архиве");
    if (!subject) reasons.push("Дисциплина недоступна");
    if (reasons.length) issues.push({ id: `published-lesson:${lesson.id}`, kind: "published-lesson", level: "action", title: subject?.name ?? "Дисциплина недоступна", detail: `${lesson.startsAt}–${lesson.endsAt} · ${teacher?.name ?? lesson.teacherName}${teacher ? ` (${teacher.login})` : ""} · ${group?.name ?? "Группа недоступна"}. ${reasons.join(". ")}.`, groupId: group?.id, groupArchived: group?.status === "archived", subjectId: lesson.subjectId, accountId: teacher?.id, weekStart: week.weekStart, lessonDate: lesson.date });
  }
  const counts = { action: 0, review: 0 };
  const kinds: Record<AdministrationIssueKind, number> = { "empty-group": 0, "unassigned-subject": 0, "student-number": 0, "published-lesson": 0 };
  for (const issue of issues) { counts[issue.level]++; kinds[issue.kind]++; }
  const filtered = issues.filter((issue) => (query.kind === "all" || issue.kind === query.kind) && (query.level === "all" || issue.level === query.level) && matchesSearchText(`${issue.title} ${issue.detail} ${issue.lessonDate ?? ""}`, query.q));
  filtered.sort((a, b) => (a.level === b.level ? 0 : a.level === "action" ? -1 : 1) || (a.lessonDate ?? "9999").localeCompare(b.lessonDate ?? "9999") || collator.compare(a.title, b.title) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(filtered.length / ADMINISTRATION_CHECK_PAGE_SIZE));
  const page = Math.min(Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1, pages);
  return { rows: filtered.slice((page - 1) * ADMINISTRATION_CHECK_PAGE_SIZE, page * ADMINISTRATION_CHECK_PAGE_SIZE), total: filtered.length, page, pages, checkedAt: new Date(instant).toISOString(), counts, kinds };
};
