import type { SavedAssignment, SavedSubmission } from "./assignmentStorage";
import { checkBackupAbort } from "./localBackup";

export interface ArchivedNotificationTargets {
  assignments?: readonly SavedAssignment[];
  submissions?: readonly SavedSubmission[];
  subjectIds?: ReadonlySet<string>;
  groupIds?: ReadonlySet<string>;
}
type Finding = (level: "error" | "review", code: string, message: string) => void;
type AcademicArea = { subjectId: string; groupId?: string };
type Target = AcademicArea & { groupId: string; assignmentId: string; submissionId?: string };
const decodePart = (value: string) => decodeURIComponent(value.replaceAll("+", " "));
const decodePathId = (part: string) => {
  const id = decodeURIComponent(part);
  if (!id.trim() || id === "." || id === ".." || /[%/\\]/u.test(id)) throw new Error("Ambiguous archived route ID");
  return id;
};

const parseTarget = (href: string): Target | "outside" | "ambiguous" => {
  const beforeHash = href.split("#", 1)[0]; const queryStart = beforeHash.indexOf("?");
  if (queryStart < 0) return "outside";
  const path = beforeHash.slice(0, queryStart); const query = beforeHash.slice(queryStart + 1);
  const values = new Map<string, string>(); const duplicates = new Set<string>();
  try {
    // URLSearchParams silently replaces malformed UTF-8; retain ambiguity instead of repairing an archived ID.
    for (const item of query.split("&")) {
      const split = item.indexOf("="); const key = decodePart(split < 0 ? item : item.slice(0, split));
      if (!["assignment", "submission", "tab"].includes(key)) continue;
      if (values.has(key)) duplicates.add(key);
      else values.set(key, split < 0 ? "" : item.slice(split + 1));
    }
    if (!values.has("assignment") && !values.has("submission")) return "outside";
    if (duplicates.size) return "ambiguous";
    const assignmentId = values.has("assignment") ? decodePart(values.get("assignment")!) : undefined;
    const submissionId = values.has("submission") ? decodePart(values.get("submission")!) : undefined;
    const tab = values.has("tab") ? decodePart(values.get("tab")!) : undefined;
    if (!assignmentId?.trim() || (submissionId !== undefined && !submissionId.trim()) || ["journal", "materials", "history"].includes(tab ?? "")) return "ambiguous";
    const parts = path.split("/");
    if (parts.length !== 4 || parts[0] || parts[1] !== "journal") return "ambiguous";
    const [subjectId, groupId] = parts.slice(2).map(decodePathId);
    return { subjectId, groupId, assignmentId, submissionId };
  } catch { return "ambiguous"; }
};

const parseAreaTarget = (href: string): AcademicArea | "outside" | "ambiguous" => {
  const beforeHash = href.split("#", 1)[0]; const queryStart = beforeHash.indexOf("?");
  const path = queryStart < 0 ? beforeHash : beforeHash.slice(0, queryStart);
  if (path === "/journal" || !path.startsWith("/journal/")) return "outside";
  const parts = path.split("/");
  if (parts.length !== 3 && parts.length !== 4) return "ambiguous";
  try {
    if (queryStart >= 0) {
      let hasTab = false;
      for (const item of beforeHash.slice(queryStart + 1).split("&")) {
        const split = item.indexOf("="); const key = decodePart(split < 0 ? item : item.slice(0, split));
        if (key !== "tab") continue;
        if (hasTab) return "ambiguous";
        hasTab = true; decodePart(split < 0 ? "" : item.slice(split + 1));
      }
    }
    return { subjectId: decodePathId(parts[2]), ...(parts.length === 4 ? { groupId: decodePathId(parts[3]) } : {}) };
  } catch { return "ambiguous"; }
};

/** Index only decoded archive lists; a matching target is not evidence of recipient authorization. */
export const createArchivedNotificationTargetCheck = async (sources: ArchivedNotificationTargets = {}, signal?: AbortSignal) => {
  const assignments = new Map<string, SavedAssignment>(); const submissions = new Map<string, SavedSubmission>();
  const stats = { targets: 0, matched: 0, unresolved: 0, outside: 0 }; let count = 0;
  const areas = { targets: 0, matched: 0, unresolved: 0 };
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  checkBackupAbort(signal);
  for (const assignment of sources.assignments ?? []) { await step(); assignments.set(assignment.id, assignment); }
  for (const submission of sources.submissions ?? []) { await step(); submissions.set(submission.id, submission); }
  const inspectArea = (target: AcademicArea, finding: Finding) => {
    if (!sources.subjectIds || (target.groupId !== undefined && !sources.groupIds)) {
      finding("review", "unchecked-notification-target-catalogs", "Учебная область цели не проверена по каталогам: нужные дисциплины или группы отсутствуют либо не читаются в архиве. Текущие и встроенные определения не подставлялись."); return false;
    }
    if (!sources.subjectIds.has(target.subjectId) || (target.groupId !== undefined && !sources.groupIds!.has(target.groupId))) {
      finding("review", "missing-notification-target-area", "Дисциплина или группа цели не найдена в сохранённых каталогах архива. Ссылка не подтверждает доступность учебной области; запись по названию не подбиралась."); return false;
    }
    return true;
  };
  const inspect = (href: string, finding: Finding) => {
    checkBackupAbort(signal); const target = parseTarget(href);
    if (target === "outside") {
      const area = parseAreaTarget(href);
      if (area === "outside") { stats.outside++; return; }
      areas.targets++;
      if (area === "ambiguous") {
        areas.unresolved++;
        finding("review", "ambiguous-notification-area-target", "Учебную область ссылки журнала нельзя однозначно прочитать: проверьте маршрут, кодирование и повторяющиеся параметры вкладки. Исходный адрес не раскрыт и не исправлен."); return;
      }
      if (inspectArea(area, finding)) areas.matched++; else areas.unresolved++;
      return;
    }
    stats.targets++;
    if (target === "ambiguous") {
      stats.unresolved++;
      finding("review", "ambiguous-notification-target", "Цель задания или ответа нельзя однозначно прочитать из сохранённой ссылки: проверьте маршрут, кодирование, повторяющиеся параметры и выбранную вкладку. Исходный адрес не раскрыт и не исправлен."); return;
    }
    let matched = true;
    const note = (level: "error" | "review", code: string, message: string) => { matched = false; finding(level, code, message); };
    const assignment = assignments.get(target.assignmentId);
    if (!sources.assignments) note("review", "unchecked-notification-assignment", "Цель задания не проверена: список заданий отсутствует или не читается в архиве. Встроенные задания и данные браузера не подставлялись.");
    else if (!assignment) note("review", "missing-notification-assignment", "Целевое задание отсутствует в читаемом списке архива. Оно могло быть удалено после уведомления; перед восстановлением нужно решить, как сохранить такой переход. Задание по названию не подбиралось.");
    else if (!assignment.subjectId || !assignment.groupId) note("review", "legacy-notification-target-area", "У целевого задания нет сохранённого ID дисциплины или группы. Учебную область ссылки нельзя сверить по названиям; требуется отдельное решение для старой записи.");
    else if (assignment.subjectId !== target.subjectId || assignment.groupId !== target.groupId) note("error", "notification-target-area-conflict", "Учебная область ссылки уведомления расходится с сохранёнными ID дисциплины или группы целевого задания. Адрес и задание не изменялись.");
    inspectArea(target, note);
    if (target.submissionId !== undefined) {
      const submission = submissions.get(target.submissionId);
      if (!sources.submissions) note("review", "unchecked-notification-submission", "Цель ответа не проверена: список ответов отсутствует или не читается в архиве. Другой ответ или последняя попытка не подставлялись.");
      else if (!submission) note("review", "missing-notification-submission", "Целевой ответ отсутствует в читаемом списке архива. Он мог быть удалён после уведомления; ответ того же студента или задание не используются для подбора замены.");
      else if (submission.assignmentId !== target.assignmentId) note("error", "notification-target-submission-conflict", "Сохранённый ответ из ссылки относится к другому ID задания. Совпадение имён или текста не используется; связь уведомления не исправлялась.");
    }
    if (matched) stats.matched++; else stats.unresolved++;
  };
  const summary = () => `Целей заданий и ответов: ${stats.targets}; сопоставлено: ${stats.matched}; не подтверждено: ${stats.unresolved}; ссылок вне этой сверки: ${stats.outside}. Учебных областей ссылок журнала: ${areas.targets}; сопоставлено: ${areas.matched}; не подтверждено: ${areas.unresolved}. Сверяются ID цели, задания ответа и учебной области, а не права получателя или доступность на дату уведомления. Наличие области в каталогах не подтверждает содержимое журнала, оценки или материалы. Общие разделы и другие типы целей не подтверждаются этой сверкой. Адреса не открывались и не изменялись.`;
  return { inspect, summary };
};
