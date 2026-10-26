import { authorizeAccountCommand, getStudentGroupId, normalizeAccountLogin, validateAccountDraft, type AccountCommandContext, type AccountDraft, type AccountsDocument, type PortalAccount } from "./accounts";
import { groupNameKey, isGroupActive, type GroupStatus } from "./groupCatalog";
import { MAX_IMPORT_ROWS } from "./importTable";
import { getStudentNumberYear, previewStudentNumber, type StudentNumberPreview } from "./studentRecord";
import type { StudentImportReceipt } from "./studentImportReceipt";

export interface StudentImportRow { line: number; name: string; login: string; group: string; campus: string; email: string }
export interface StudentImportRequest { rows: StudentImportRow[]; defaultGroupId: string; defaultCampus: number | null }
export interface StudentImportGroup { id: string; name: string; campus?: number; status?: GroupStatus }
export interface StudentImportPreviewRow {
  line: number; name: string; login: string; groupName: string; campus?: number; email: string;
  status: "ready" | "existing" | "error"; errors: string[]; warnings: string[];
  draft?: AccountDraft; studentNumber?: string; accountId?: string; allocation?: StudentNumberPreview;
}
export interface StudentImportPlan { rows: StudentImportPreviewRow[]; ready: number; existing: number; errors: number; year: number; counters: Record<string, number> }
export interface StudentImportPreview extends StudentImportPlan {
  fingerprint: string; expectedRevision: number; actorRevision: number; groupRevision: number; previousImport?: StudentImportReceipt;
}
export interface ApplyStudentImportCommand extends AccountCommandContext {
  batchId: string; request: StudentImportRequest; fingerprint: string; expectedGroupRevision: number;
  expectedYear: number; expectedStudentNumbers: string[];
}
const normalizedName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
const sameName = (a: string, b: string) => groupNameKey(a) === groupNameKey(b);

export const studentImportSourceKey = (request: StudentImportRequest) => {
  assertRequest(request);
  return JSON.stringify({ defaultGroupId: request.defaultGroupId, defaultCampus: request.defaultCampus, rows: request.rows.map((row) => [normalizedName(row.name), normalizeAccountLogin(row.login), groupNameKey(row.group), row.campus.normalize("NFKC").trim().toLocaleLowerCase("ru-RU"), row.email.trim().toLowerCase()]) });
};
const assertRequest = (request: StudentImportRequest) => {
  if (!request || !Array.isArray(request.rows) || !request.rows.length || request.rows.length > MAX_IMPORT_ROWS || typeof request.defaultGroupId !== "string" || request.defaultGroupId.length > 120 || (request.defaultCampus !== null && (!Number.isInteger(request.defaultCampus) || request.defaultCampus < 1 || request.defaultCampus > 9))) throw new Error("Проверьте список, группу и корпус импорта.");
  const lines = new Set<number>();
  for (const row of request.rows) {
    if (!row || !Number.isSafeInteger(row.line) || row.line < 1 || lines.has(row.line) || [row.name, row.login, row.group, row.campus, row.email].some((field) => typeof field !== "string" || field.length > 500)) throw new Error("Некорректная строка списка студентов.");
    lines.add(row.line);
  }
};

export const previewStudentImport = (state: AccountsDocument, groups: StudentImportGroup[], request: StudentImportRequest, date: string): StudentImportPlan => {
  assertRequest(request);
  const year = getStudentNumberYear(date);
  const byLogin = new Map(state.accounts.map((account) => [normalizeAccountLogin(account.login), account]));
  const byName = new Map<string, string[]>();
  for (const account of state.accounts) { const key = groupNameKey(account.name); const logins = byName.get(key) ?? []; logins.push(account.login); byName.set(key, logins); }
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const groupsByName = new Map(groups.map((group) => [groupNameKey(group.name), group]));
  const duplicateLogins = new Map<string, number>();
  const duplicateNames = new Map<string, number>();
  for (const row of request.rows) { const login = normalizeAccountLogin(row.login); duplicateLogins.set(login, (duplicateLogins.get(login) ?? 0) + 1); }
  for (const row of request.rows) { const name = groupNameKey(row.name); duplicateNames.set(name, (duplicateNames.get(name) ?? 0) + 1); }
  const counters = { ...state.studentNumberCounters };
  const allocations = new Map<number, StudentNumberPreview>();
  const rows = request.rows.map((source): StudentImportPreviewRow => {
    const name = normalizedName(source.name);
    const login = normalizeAccountLogin(source.login);
    const email = source.email.trim().toLowerCase();
    const group = source.group.trim() ? groupsByName.get(groupNameKey(source.group)) : groupsById.get(request.defaultGroupId);
    const campusText = source.campus.normalize("NFKC").trim();
    const campus = campusText ? Number(/^(?:корпус\s*)?([1-9])$/iu.exec(campusText)?.[1] ?? NaN) : request.defaultCampus ?? group?.campus;
    const row: StudentImportPreviewRow = { line: source.line, name, login, email, groupName: group?.name ?? source.group.trim(), campus: Number.isInteger(campus) ? campus : undefined, status: "error", errors: [], warnings: [] };
    if (!group) row.errors.push(source.group.trim() ? "Группа не найдена. Сначала создайте её в справочнике." : "Выберите общую группу или столбец с группой.");
    if (group && !isGroupActive(group)) row.errors.push("Группа находится в архиве. Выберите действующую группу.");
    if (!Number.isInteger(campus) || !campus || campus < 1 || campus > 9) row.errors.push("Укажите корпус от 1 до 9 в строке, общих настройках или группе.");
    if (duplicateLogins.get(login)! > 1) row.errors.push("Логин повторяется в загружаемом списке.");
    if (duplicateNames.get(groupNameKey(name))! > 1) row.warnings.push("ФИО повторяется в списке. Проверьте логины: разные логины создадут разные учётки.");
    const draft: AccountDraft = { name, login, email, role: "student", studentGroupId: group?.id ?? "missing", studentCampus: campus, memberships: [] };
    try { validateAccountDraft(draft, []); }
    catch (error) { row.errors.push(error instanceof Error ? error.message : "Проверьте данные студента."); }
    const existing = byLogin.get(login);
    if (existing) {
      if (existing.role !== "student" || !sameName(existing.name, name) || getStudentGroupId(existing) !== group?.id || (email && email !== (existing.email ?? "")) || (existing.studentRecord && existing.studentRecord.campus !== campus)) row.errors.push("Логин занят записью с другими данными. Импорт не изменяет существующие учётки.");
      if (!row.errors.length) { row.status = "existing"; row.accountId = existing.id; row.studentNumber = existing.studentRecord?.number; if (existing.status === "blocked") row.warnings.push("Учётная запись уже есть; доступ заблокирован и останется без изменений."); }
    } else {
      const namesakes = byName.get(groupNameKey(name));
      if (namesakes?.length) row.warnings.push(`Совпадает ФИО, но логин другой: ${namesakes.slice(0, 3).join(", ")}. Проверьте, что это другой человек.`);
      if (!row.errors.length) {
        try {
          const previous = allocations.get(campus!);
          const allocation = previous ? { ...previous, sequence: previous.sequence + 1, number: `${year}${campus}${String(previous.sequence + 1).padStart(4, "0")}` } : previewStudentNumber(state, campus!, date);
          if (allocation.sequence > 9999) throw new Error(`В корпусе ${campus} исчерпаны номера зачеток за ${year} год.`);
          allocations.set(campus!, allocation); counters[`${year}:${campus}`] = allocation.sequence;
          row.status = "ready"; row.studentNumber = allocation.number; row.allocation = allocation; row.draft = draft;
        } catch (error) { row.errors.push(error instanceof Error ? error.message : "Не удалось получить номер зачетки."); }
      }
    }
    return row;
  });
  return { rows, year, counters, ready: rows.filter((row) => row.status === "ready").length, existing: rows.filter((row) => row.status === "existing").length, errors: rows.filter((row) => row.status === "error").length };
};

export const applyStudentImport = (state: AccountsDocument, command: ApplyStudentImportCommand, groups: StudentImportGroup[], groupRevision: number, date: string, identities: Array<{ id: string; changeId: string }>): { state: AccountsDocument; receipt: StudentImportReceipt; replayed: boolean } => {
  authorizeAccountCommand(state, { ...command, expectedRevision: state.revision });
  if (typeof command.batchId !== "string" || !command.batchId.trim() || command.batchId.length > 120 || typeof command.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(command.fingerprint)) throw new Error("Некорректный идентификатор пакета импорта.");
  const receipts = state.studentImports ?? [];
  const previous = receipts.find((receipt) => receipt.id === command.batchId);
  if (previous && previous.fingerprint !== command.fingerprint) throw new Error("Этот пакет уже использован для другого списка. Подготовьте новый предпросмотр.");
  const completed = previous ?? receipts.find((receipt) => receipt.fingerprint === command.fingerprint);
  if (completed) return { state, receipt: completed, replayed: true };
  authorizeAccountCommand(state, command);
  if (groupRevision !== command.expectedGroupRevision) throw new Error("Справочник групп изменился. Обновите предпросмотр перед созданием.");
  const plan = previewStudentImport(state, groups, command.request, date);
  if (plan.errors) throw new Error(`В списке есть ошибки: ${plan.errors}. Исправьте строки и обновите предпросмотр.`);
  if (!plan.ready) throw new Error("Новых студентов нет: существующие учётные записи не изменены.");
  const ready = plan.rows.filter((row) => row.status === "ready");
  if (plan.year !== command.expectedYear || JSON.stringify(ready.map((row) => row.studentNumber)) !== JSON.stringify(command.expectedStudentNumbers)) throw new Error("Номера зачеток изменились. Обновите предпросмотр и проверьте новые номера.");
  const ids = new Set(state.accounts.map((account) => account.id));
  const historyIds = new Set(state.history.map((change) => change.id));
  if (identities.length !== ready.length || identities.some((identity) => !identity.id || ids.has(identity.id) || !identity.changeId || historyIds.has(identity.changeId)) || new Set(identities.map((identity) => identity.id)).size !== ready.length || new Set(identities.map((identity) => identity.changeId)).size !== ready.length) throw new Error("Не удалось подготовить уникальные записи импорта.");
  const accounts: PortalAccount[] = ready.map((row, index) => {
    const record = row.allocation!;
    return { ...validateAccountDraft(row.draft!, []), id: identities[index].id, revision: 1, status: "active", createdAt: date, updatedAt: date, studentRecord: { number: record.number, year: record.year, campus: record.campus, sequence: record.sequence, issuedAt: date } };
  });
  const receipt: StudentImportReceipt = { id: command.batchId, fingerprint: command.fingerprint, actorId: command.actorId, createdAt: date, sourceRowCount: plan.rows.length, created: ready.map((row, index) => ({ line: row.line, accountId: accounts[index].id, studentNumber: row.studentNumber! })), skipped: plan.rows.filter((row) => row.status === "existing").map((row) => ({ line: row.line, accountId: row.accountId! })) };
  return { replayed: false, receipt, state: { ...state, revision: state.revision + 1, accounts: [...state.accounts, ...accounts], studentNumberCounters: plan.counters, studentImports: [...receipts, receipt], history: [...state.history, ...accounts.map((account, index) => ({ id: identities[index].changeId, actorId: command.actorId, accountId: account.id, occurredAt: date, action: "created" as const, previousRole: null, nextRole: "student" as const, importBatchId: receipt.id }))] } };
};
