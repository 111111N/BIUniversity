import { getStudentGroupId, type AccountsDocument } from "./accounts";
import { isGroupActive, type GroupCatalogDocument } from "./groupCatalog";
import { isStudyingStudent } from "./studentEnrollment";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";

/** Compare saved current states, not historical membership or the time of inspection. */
export const inspectArchivedGroupStates = async (
  groups: GroupCatalogDocument | undefined, accounts: AccountsDocument | undefined,
  schedule: ManagedScheduleSnapshot | undefined, completedAt: string, signal?: AbortSignal,
) => {
  const issues: BackupDocumentIssue[] = [];
  const archived = new Set<string>();
  const stats = { students: 0, assignments: 0, drafts: 0, future: 0, past: 0 };
  let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const finding = (code: string, message: string, groupId?: string, path?: string[]) => issues.push({
    kind: "groups", level: "error", code, message, referenceId: groupId,
    ...(path ? { recordId: JSON.stringify(path) } : {}),
  } satisfies BackupDocumentIssue);
  const unchecked = (code: string, message: string) => issues.push({ kind: "groups", level: "review", code, message });
  checkBackupAbort(signal);
  if (!groups) return { issues, summary: "Состояния групп не проверены: каталог отсутствует или не читается. Группы браузера не подставлялись." };
  for (const group of groups.groups) { await step(); if (!isGroupActive(group)) archived.add(group.id); }
  const timestamp = Date.parse(completedAt);
  if (archived.size && !accounts) unchecked("unchecked-archived-group-accounts", "Состав и назначения архивированных групп не проверены: документ учёток отсутствует или не читается. Отсутствие студентов и преподавателей не подтверждено.");
  if (archived.size && !schedule) unchecked("unchecked-archived-group-schedule", "Пары архивированных групп не проверены: расписание отсутствует или не читается. Отсутствие черновиков и будущих пар не подтверждено.");
  if (archived.size && schedule && !Number.isFinite(timestamp)) unchecked("unchecked-archived-group-time", "Будущие пары архивированных групп не определены: дата завершения архива некорректна. Время устройства не подставлялось.");
  if (archived.size) {
    for (const account of accounts?.accounts ?? []) {
      await step(); const groupId = getStudentGroupId(account);
      if (groupId && archived.has(groupId) && isStudyingStudent(account)) {
        stats.students++;
        finding("archived-group-student", "В архивированной группе сохранён студент, который ещё учится. Блокировка входа не завершает обучение; перед восстановлением нужно согласовать состояние группы и студента. Записи не изменены.", groupId, ["student", account.id]);
      }
      if (account.role !== "teacher") continue;
      for (const membership of account.memberships) {
        await step();
        for (const id of membership.groupIds) {
          await step(); if (!archived.has(id)) continue;
          stats.assignments++;
          finding("archived-group-assignment", "В архивированной группе сохранено назначение преподавателя. По текущим правилам оно блокирует архивирование независимо от доступа к входу; перед восстановлением нужно согласовать записи. Назначение не снималось.", id, ["teaching-assignment", account.id, membership.subjectId]);
        }
      }
    }
    for (const week of schedule?.drafts ?? []) {
      await step(); if (!archived.has(week.groupId)) continue;
      for (const lesson of week.lessons) {
        await step(); stats.drafts++;
        finding("archived-group-draft", "В архивированной группе сохранена пара черновика. По текущим правилам даже прошедшая дата черновика не снимает эту зависимость; перед восстановлением нужно согласовать записи. Пара не удалялась.", week.groupId, ["draft", lesson.id]);
      }
    }
    for (const week of schedule?.published ?? []) {
      await step(); if (!archived.has(week.groupId)) continue;
      for (const lesson of week.lessons) {
        await step(); if (!Number.isFinite(timestamp)) continue;
        // The group status service uses lesson end in Moscow; exactly ended lessons are historical.
        if (Date.parse(`${lesson.date}T${lesson.endsAt}:00+03:00`) <= timestamp) { stats.past++; continue; }
        stats.future++;
        finding("archived-group-future-lesson", "В архивированной группе сохранена опубликованная пара, которая ещё не завершилась на дату архива по московскому времени. Перед восстановлением нужно согласовать записи. Пара не отменялась и не переносилась.", week.groupId, ["published", lesson.id]);
      }
    }
  }
  checkBackupAbort(signal);
  const accountsKnown = !archived.size || accounts !== undefined;
  const scheduleKnown = !archived.size || schedule !== undefined;
  const timeKnown = scheduleKnown && (!archived.size || Number.isFinite(timestamp));
  return { issues, summary: `Архивированных групп: ${archived.size}. Связей с учащимися: ${accountsKnown ? stats.students : "не проверено"}; назначений преподавателей: ${accountsKnown ? stats.assignments : "не проверено"}; пар черновиков: ${scheduleKnown ? stats.drafts : "не проверено"}; незавершённых опубликованных пар на дату архива: ${timeKnown ? stats.future : "не проверено"}; прошедших опубликованных пар: ${timeKnown ? stats.past : "не проверено"}. Это сверка сохранённых текущих состояний по действующим правилам, а не проверка истории архивирования. Снимки разных хранилищ могут относиться к разным моментам. Состояния и связи не изменялись.` };
};
