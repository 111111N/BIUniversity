import { educationContinuationError, normalizeEducationDetails, sameEducationState, type EducationEventDetails, type StudentEducationEvent } from "./studentEducationEvent";
import { authorizeAccountCommand, getStudentGroupId, type AccountChange, type AccountCommandContext, type AccountsDocument } from "./accounts";
import { isGroupActive } from "./groupCatalog";
import { isStudentBulkAction, type StudentBulkAction, type StudentBulkReceipt, type StudentBulkSnapshot } from "./studentBulkReceipt";
import type { RegistryGroup } from "./studentRegistry";

export const MAX_STUDENT_BULK_TARGETS = 1000;
export interface StudentBulkRequest { targets: Array<{ accountId: string; revision: number }>; action: StudentBulkAction; education?: EducationEventDetails }
export interface StudentBulkPreviewRow { accountId: string; name: string; studentNumber?: string; outcome: "changed" | "unchanged" | "error"; before?: StudentBulkSnapshot; after?: StudentBulkSnapshot; errors: string[] }
export interface StudentBulkPlan { rows: StudentBulkPreviewRow[]; changed: number; unchanged: number; errors: number }
export interface StudentBulkPreview extends StudentBulkPlan { request: StudentBulkRequest; fingerprint: string; expectedRevision: number; groupRevision: number; actorRevision: number }
export interface ApplyStudentBulkCommand extends AccountCommandContext { batchId: string; fingerprint: string; request: StudentBulkRequest; expectedGroupRevision: number }
export const getStudentTransferGroupProblem = (group: RegistryGroup | undefined) => !group || !isGroupActive(group) ? "Для перевода выберите действующую группу." : "";
export const assertStudentBulkRequest = (request: StudentBulkRequest) => {
  if (!request || !Array.isArray(request.targets) || !request.targets.length || request.targets.length > MAX_STUDENT_BULK_TARGETS || !isStudentBulkAction(request.action) || request.targets.some((target) => !target || typeof target.accountId !== "string" || !target.accountId.trim() || target.accountId.length > 120 || !Number.isSafeInteger(target.revision) || target.revision < 0) || new Set(request.targets.map((target) => target.accountId)).size !== request.targets.length) throw new Error("Выберите от 1 до 1000 разных студентов и допустимое действие.");
};
export const studentBulkSourceKey = (request: StudentBulkRequest) => {
  assertStudentBulkRequest(request);
  return JSON.stringify({ ...(request.education !== undefined ? { education: normalizeEducationDetails(request.education, "2999-12-30T12:00:00Z") } : {}), action: request.action.kind === "transfer" ? { kind: "transfer", groupId: request.action.groupId } : { kind: request.action.kind }, targets: request.targets.map((target) => [target.accountId, target.revision]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) });
};
export const previewStudentBulk = (state: AccountsDocument, groups: RegistryGroup[], request: StudentBulkRequest, registeredAt = new Date().toISOString()): StudentBulkPlan => {
  assertStudentBulkRequest(request);
  const education = request.education !== undefined ? normalizeEducationDetails(request.education, registeredAt) : undefined;
  const eventsByAccount = new Map<string, StudentEducationEvent[]>();
  for (const event of state.educationEvents ?? []) { const events = eventsByAccount.get(event.accountId) ?? []; events.push(event); eventsByAccount.set(event.accountId, events); }
  const byId = new Map(state.accounts.map((account) => [account.id, account])); const groupsById = new Map(groups.map((group) => [group.id, group]));
  const targetGroup = request.action.kind === "transfer" ? groupsById.get(request.action.groupId) : undefined;
  const transferGroupProblem = request.action.kind === "transfer" ? getStudentTransferGroupProblem(targetGroup) : "";
  const rows = request.targets.map((target): StudentBulkPreviewRow => {
    const account = byId.get(target.accountId); const errors: string[] = [];
    const row: StudentBulkPreviewRow = { accountId: target.accountId, name: account?.name ?? "Учётная запись недоступна", studentNumber: account?.studentRecord?.number, outcome: "error", errors };
    if (!account || account.role !== "student") { errors.push("Студент не найден или тип учётной записи изменён."); return row; }
    if (account.revision !== target.revision) errors.push("Запись изменилась после выбора. Обновите предпросмотр.");
    const groupId = getStudentGroupId(account); const group = groupsById.get(groupId ?? "");
    if (!groupId || !group) { errors.push("Исходная группа недоступна. Сначала проверьте учётку студента."); return row; }
    row.before = { groupId, groupName: group.name, enrollment: account.enrollmentStatus ?? "studying" };
    row.after = { ...row.before };
    if (request.action.kind === "transfer") {
      if (transferGroupProblem) errors.push(transferGroupProblem);
      if (row.before.enrollment !== "studying") errors.push("Массовый перевод доступен учащимся. Для возобновления обучения откройте учётку отдельно.");
      if (targetGroup) row.after = { ...row.before, groupId: targetGroup.id, groupName: targetGroup.name };
    } else {
      if (row.before.enrollment !== "studying" && row.before.enrollment !== request.action.kind) errors.push("Состояние обучения уже изменено. Исправление выпускника или отчисленного выполняется в его учётке.");
      row.after.enrollment = request.action.kind;
    }
    if (!sameEducationState(row.before, row.after)) {
      const events = eventsByAccount.get(account.id) ?? [];
      if (!education && events.length) errors.push("Укажите дату действия и основание события обучения.");
      if (education) { const issue = educationContinuationError(events, row.before, education.effectiveDate); if (issue) errors.push(issue); }
    }
    if (!errors.length) row.outcome = row.before.groupId === row.after.groupId && row.before.enrollment === row.after.enrollment ? "unchanged" : "changed";
    return row;
  });
  return { rows, changed: rows.filter((row) => row.outcome === "changed").length, unchanged: rows.filter((row) => row.outcome === "unchanged").length, errors: rows.filter((row) => row.outcome === "error").length };
};
export const applyStudentBulk = (state: AccountsDocument, command: ApplyStudentBulkCommand, groups: RegistryGroup[], groupRevision: number, occurredAt: string, changeIds: string[]): { state: AccountsDocument; receipt: StudentBulkReceipt; replayed: boolean } => {
  authorizeAccountCommand(state, { ...command, expectedRevision: state.revision });
  assertStudentBulkRequest(command.request);
  if (typeof command.batchId !== "string" || !command.batchId.trim() || command.batchId.length > 120 || typeof command.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(command.fingerprint)) throw new Error("Некорректный пакет изменения студентов.");
  const previous = state.studentOperations?.find((receipt) => receipt.id === command.batchId);
  if (previous) { if (previous.fingerprint !== command.fingerprint) throw new Error("Этот пакет уже применён к другому выбору. Подготовьте новое действие."); return { state, receipt: previous, replayed: true }; }
  authorizeAccountCommand(state, command);
  if (groupRevision !== command.expectedGroupRevision) throw new Error("Справочник групп изменился. Обновите предпросмотр.");
  const plan = previewStudentBulk(state, groups, command.request, occurredAt);
  if (plan.errors) throw new Error(`В выбранных записях есть ошибки: ${plan.errors}. Ничего не изменено.`);
  if (!plan.changed) throw new Error("Изменений нет. Выбранное действие уже выполнено для этих студентов.");
  const changed = plan.rows.filter((row) => row.outcome === "changed"); const oldChangeIds = new Set(state.history.map((entry) => entry.id));
  if (!Number.isFinite(Date.parse(occurredAt)) || changeIds.length !== plan.rows.length || new Set(changeIds).size !== changeIds.length || changeIds.some((id) => !id || oldChangeIds.has(id))) throw new Error("Не удалось подготовить историю пакетного изменения.");
  const byId = new Map(changed.map((row) => [row.accountId, row]));
  const history: AccountChange[] = changed.map((row, index) => ({ id: changeIds[index], actorId: command.actorId, accountId: row.accountId, occurredAt, action: "details-changed", previousRole: "student", nextRole: "student", studentOperationBatchId: command.batchId, changes: command.request.action.kind === "transfer" ? [{ field: "group", before: row.before!.groupId, after: row.after!.groupId }] : [{ field: "enrollmentStatus", before: row.before!.enrollment, after: row.after!.enrollment }] }));
  const education = command.request.education !== undefined ? normalizeEducationDetails(command.request.education, occurredAt) : undefined;
  const accountById = new Map(state.accounts.map((account) => [account.id, account]));
  const events: StudentEducationEvent[] = education ? changed.map((row, index) => {
    const audit = history[index]; const id = 'education-' + audit.id; audit.educationEventId = id;
    return { ...education, id, accountId: row.accountId, actorId: command.actorId, registeredAt: occurredAt, accountRevisionAfter: accountById.get(row.accountId)!.revision + 1, kind: command.request.action.kind === "transfer" ? "transferred" : command.request.action.kind, before: row.before!, after: row.after!, auditId: audit.id, batchId: command.batchId };
  }) : [];
  const receipt: StudentBulkReceipt = { id: command.batchId, fingerprint: command.fingerprint, actorId: command.actorId, occurredAt, action: command.request.action, ...(education ? { education } : {}), rows: plan.rows.map((row) => ({ accountId: row.accountId, outcome: row.outcome as "changed" | "unchanged", before: row.before!, after: row.after! })) };
  return { receipt, replayed: false, state: { ...state, revision: state.revision + 1, accounts: state.accounts.map((account) => { const row = byId.get(account.id); return row ? { ...account, revision: account.revision + 1, updatedAt: occurredAt, ...(command.request.action.kind === "transfer" ? { studentGroupId: row.after!.groupId, memberships: [] } : { enrollmentStatus: row.after!.enrollment }) } : account; }), history: [...state.history, ...history], ...(events.length ? { educationEvents: [...(state.educationEvents ?? []), ...events] } : {}), studentOperations: [...(state.studentOperations ?? []), receipt] } };
};
