import { getStudentGroupId, isAccountActive, type PortalAccount } from "./accounts";
import {
  isSupervisedAssessment,
  type Assessment, type AssessmentAttempt, type AssessmentAttemptDraft, type AssessmentCommand,
  type AssessmentDocument, type AssessmentGroupOption, type AssessmentHistoryEntry, type AssessmentKind,
  type AssessmentOutcome, type AssessmentResult, type AssessmentSubjectOption, type AssessmentRecordBookMetadata,
} from "./assessmentTypes";

export interface AssessmentDomainContext {
  accounts: PortalAccount[]; accountsRevision: number;
  groups: AssessmentGroupOption[]; groupRevision: number;
  subjects: AssessmentSubjectOption[]; subjectRevision: number;
}
export interface AssessmentGeneratedValues { assessmentId: string; attemptId: string; historyId: string; occurredAt: string }

const MAX_TEXT = 16 * 1024 * 1024;
const MAX_ITEMS = 250_000;
function fail(message = "Данные аттестаций повреждены. Восстановите корректную копию."): never { throw new Error(message); }
const object = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) return fail();
  return record;
};
const string = (value: unknown, min = 1, max = 256): value is string => typeof value === "string" && value.length >= min && value.length <= max && value.trim() === value && !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const id = (value: unknown): value is string => string(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) > 0 && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) && date(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const time = (value: unknown): value is string => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
/** Dates are entered in Moscow time; the current academic period uses the fixed UTC+03 offset. */
export const assessmentStartsAt = (attempt: Pick<AssessmentAttempt, "date" | "startsAt">): number => {
  if (!date(attempt.date) || !time(attempt.startsAt)) fail("Выберите корректные дату и время аттестации по Москве.");
  return Date.parse(`${attempt.date}T${attempt.startsAt}:00+03:00`);
};
export const canRecordAssessmentResults = (attempt: Pick<AssessmentAttempt, "date" | "startsAt">, now: string): boolean => timestamp(now) && Date.parse(now) >= assessmentStartsAt(attempt);
const list = (value: unknown, max = 25_000): unknown[] => Array.isArray(value) && value.length <= max ? value : fail();
const uniqueIds = (value: unknown, nonempty = false): string[] => {
  const items = list(value, 10_000);
  if ((nonempty && !items.length) || items.some((item) => !id(item)) || new Set(items).size !== items.length) return fail();
  return items as string[];
};
const kind = (value: unknown): value is AssessmentKind => ["exam", "pass", "gradedPass", "internship", "thesis", "coursework"].includes(value as string);
const copy = <T>(value: T): T => structuredClone(value);
const equalResults = (left: AssessmentResult[], right: AssessmentResult[]) => left.length === right.length && left.every((item, index) => {
  const other = right[index];
  return item.studentId === other.studentId && (item.outcome === null ? other.outcome === null : other.outcome !== null && item.outcome.status === other.outcome.status && (item.outcome.status !== "graded" || (other.outcome.status === "graded" && item.outcome.grade === other.outcome.grade)));
});
const outcome = (value: unknown, assessmentKind: AssessmentKind): void => {
  if (value === null) return;
  const record = value as Record<string, unknown>;
  if (record?.status === "graded") {
    object(record, ["status", "grade"]);
    if (assessmentKind === "pass" || ![2, 3, 4, 5].includes(record.grade as number)) fail("Оценка должна быть от 2 до 5. Для зачёта выберите «зачтено» или «не зачтено».");
  } else {
    object(value, ["status"]);
    if (record.status !== "absent" && !(assessmentKind === "pass" && (record.status === "passed" || record.status === "failed"))) fail("Проверьте результат аттестации.");
  }
};
const results = (value: unknown, studentIds: string[], assessmentKind: AssessmentKind): AssessmentResult[] => {
  const rows = list(value, 10_000);
  const expected = new Set(studentIds);
  if (rows.length !== expected.size) fail("Состав ведомости изменился. Обновите данные.");
  const byId = new Map<string, AssessmentOutcome | null>();
  for (const row of rows) {
    const record = object(row, ["studentId", "outcome"]);
    if (!id(record.studentId) || !expected.has(record.studentId) || byId.has(record.studentId)) fail("Состав ведомости содержит лишнего или повторяющегося студента.");
    outcome(record.outcome, assessmentKind);
    byId.set(record.studentId, record.outcome as AssessmentOutcome | null);
  }
  return studentIds.map((studentId) => ({ studentId, outcome: byId.get(studentId)! }));
};

export const validateAssessmentRecordBook = (value: unknown): AssessmentRecordBookMetadata | null => {
  if (value === null) return null;
  const entry = object(value, ["semester", "hours", "category"]);
  if (!integer(entry.semester) || entry.semester < 1 || entry.semester > 99 || !integer(entry.hours) || entry.hours > 100_000 || !["required", "elective"].includes(entry.category as string)) fail("Укажите семестр от 1 до 99 и целое количество часов от 0 до 100000; выберите раздел зачётки.");
  return value as AssessmentRecordBookMetadata;
};
const sameRecordBook = (a: AssessmentRecordBookMetadata | null, b: AssessmentRecordBookMetadata | null) => a === null ? b === null : b !== null && a.semester === b.semester && a.hours === b.hours && a.category === b.category;
export const emptyAssessmentDocument = (): AssessmentDocument => ({ version: 2, revision: 0, assessments: [], history: [] });

/** The document is independently verifiable: each mutation has an immutable audit snapshot. */
const validateDocument = (value: unknown): AssessmentDocument => {
  const root = object(value, ["version", "revision", "assessments", "history"]);
  if (root.version !== 2 || !integer(root.revision)) fail();
  const assessments = list(root.assessments, 5_000) as Assessment[];
  const history = list(root.history, 50_000) as AssessmentHistoryEntry[];
  if (root.revision !== history.length) fail();
  const assessmentIds = new Set<string>();
  const attempts = new Map<string, { assessment: Assessment; attempt: AssessmentAttempt }>();
  let itemCount = history.length;
  for (const assessment of assessments) {
    object(assessment, ["id", "title", "kind", "subjectId", "subjectName", "groupId", "groupName", "period", "supervisorId", "recordBook", "roster", "attempts"]);
    validateAssessmentRecordBook(assessment.recordBook);
    if (!id(assessment.id) || assessmentIds.has(assessment.id) || !string(assessment.title, 2, 160) || !kind(assessment.kind) || !id(assessment.groupId) || !string(assessment.groupName) || !string(assessment.period, 1, 120)) fail();
    assessmentIds.add(assessment.id);
    if (isSupervisedAssessment(assessment.kind) ? !id(assessment.supervisorId) : assessment.supervisorId !== null) fail();
    if ((assessment.subjectId === null) !== (assessment.subjectName === null) || (assessment.subjectId !== null && (!id(assessment.subjectId) || !string(assessment.subjectName))) || (["exam", "pass", "gradedPass"].includes(assessment.kind) && assessment.subjectId === null)) fail();
    const roster = list(assessment.roster, 10_000);
    if (!roster.length) fail();
    const students = new Set<string>();
    for (const row of roster) {
      const student = object(row, ["studentId", "name", "studentNumber"]);
      if (!id(student.studentId) || students.has(student.studentId) || !string(student.name) || (student.studentNumber !== null && (typeof student.studentNumber !== "string" || !/^\d{4}[1-9]\d{4}$/.test(student.studentNumber)))) fail();
      students.add(student.studentId);
    }
    const sequence = list(assessment.attempts, 1_000) as AssessmentAttempt[];
    if (!sequence.length) fail();
    itemCount += roster.length + sequence.length;
    for (const [index, attempt] of sequence.entries()) {
      object(attempt, ["id", "number", "kind", "date", "startsAt", "teacherId", "chairId", "memberIds", "studentIds", "results", "state", "createdAt", "createdBy", "publishedAt", "publishedBy"]);
      if (!id(attempt.id) || attempts.has(attempt.id) || attempt.number !== index + 1 || !date(attempt.date) || !time(attempt.startsAt) || !id(attempt.teacherId) || !id(attempt.createdBy) || !timestamp(attempt.createdAt) || (assessment.supervisorId !== null && attempt.teacherId !== assessment.supervisorId)) fail();
      if ((index === 0 && attempt.kind !== "primary") || (index > 0 && !["retake", "commission"].includes(attempt.kind))) fail();
      const memberIds = uniqueIds(attempt.memberIds);
      if (attempt.kind === "commission" ? !id(attempt.chairId) || !memberIds.length || memberIds.includes(attempt.chairId) : attempt.chairId !== null || memberIds.length !== 0) fail();
      const selected = uniqueIds(attempt.studentIds, true);
      if (selected.some((studentId) => !students.has(studentId)) || (index === 0 && selected.length !== students.size)) fail();
      const normalized = results(attempt.results, selected, assessment.kind);
      if (!equalResults(attempt.results, normalized)) fail();
      itemCount += normalized.length;
      if (itemCount > MAX_ITEMS) fail("Превышен безопасный размер данных аттестаций.");
      if (attempt.state === "published") {
        if (!timestamp(attempt.publishedAt) || !id(attempt.publishedBy) || attempt.publishedBy !== attempt.teacherId || Date.parse(attempt.publishedAt) < Date.parse(attempt.createdAt) || !canRecordAssessmentResults(attempt, attempt.publishedAt) || normalized.some((result) => result.outcome === null)) fail();
      } else if (attempt.state !== "draft" || attempt.publishedAt !== null || attempt.publishedBy !== null) fail();
      const previous = sequence[index - 1];
      if (previous && (previous.state !== "published" || assessmentStartsAt(attempt) < assessmentStartsAt(previous) || Date.parse(attempt.createdAt) < Date.parse(previous.publishedAt!))) fail();
      attempts.set(attempt.id, { assessment, attempt });
    }
  }
  const historyIds = new Set<string>();
  const progression = new Map<string, { created: boolean; published: boolean; results: AssessmentResult[] }>();
  const recordBooks = new Map<string, AssessmentRecordBookMetadata | null>();
  let previousTime = -Infinity;
  for (const entry of history) {
    object(entry, ["id", "assessmentId", "attemptId", "actorId", "occurredAt", "action", "results", "recordBook"]);
    validateAssessmentRecordBook(entry.recordBook);
    const target = attempts.get(entry.attemptId);
    if (!id(entry.id) || historyIds.has(entry.id) || !target || target.assessment.id !== entry.assessmentId || !id(entry.actorId) || !timestamp(entry.occurredAt) || Date.parse(entry.occurredAt) < previousTime) fail();
    previousTime = Date.parse(entry.occurredAt);
    historyIds.add(entry.id);
    const { assessment, attempt } = target!;
    const current = progression.get(attempt.id);
    if (entry.action === "record-book-updated") {
      if (!recordBooks.has(assessment.id) || attempt.number !== 1 || entry.results !== null || entry.recordBook === null || sameRecordBook(recordBooks.get(assessment.id)!, entry.recordBook)) fail();
      recordBooks.set(assessment.id, entry.recordBook);
      continue;
    }
    if (entry.action === "created") recordBooks.set(assessment.id, entry.recordBook);
    else if (!recordBooks.has(assessment.id) || !sameRecordBook(recordBooks.get(assessment.id)!, entry.recordBook)) fail();
    if (entry.action === "created" || entry.action === "attempt-created") {
      const preceding = assessment.attempts[attempt.number - 2];
      if (current || (entry.action === "created") !== (attempt.number === 1) || entry.actorId !== attempt.createdBy || entry.occurredAt !== attempt.createdAt || entry.results !== null || (preceding && !progression.get(preceding.id)?.published)) fail();
      progression.set(attempt.id, { created: true, published: false, results: attempt.studentIds.map((studentId) => ({ studentId, outcome: null })) });
    } else if (entry.action === "results-saved" || entry.action === "published") {
      if (!current || current.published || entry.actorId !== attempt.teacherId || entry.results === null || !canRecordAssessmentResults(attempt, entry.occurredAt)) fail();
      const snapshot = results(entry.results, attempt.studentIds, assessment.kind);
      if (!equalResults(entry.results!, snapshot)) fail();
      itemCount += snapshot.length;
      if (itemCount > MAX_ITEMS) fail("Превышен безопасный размер истории аттестаций.");
      if (entry.action === "published" && (entry.occurredAt !== attempt.publishedAt || snapshot.some((row) => row.outcome === null) || !equalResults(snapshot, current!.results))) fail();
      progression.set(attempt.id, { created: true, published: entry.action === "published", results: snapshot });
    } else fail();
  }
  for (const { attempt } of attempts.values()) {
    const current = progression.get(attempt.id);
    if (!current || current.published !== (attempt.state === "published") || !equalResults(current.results, attempt.results)) fail();
  }
  for (const assessment of assessments) if (!recordBooks.has(assessment.id) || !sameRecordBook(recordBooks.get(assessment.id)!, assessment.recordBook)) fail();
  return value as AssessmentDocument;
};

export const decodeAssessmentDocument = (raw: string): AssessmentDocument => {
  if (typeof raw !== "string" || raw.length > MAX_TEXT) fail("Превышен безопасный размер документа аттестаций.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail("Не удалось прочитать данные аттестаций. Содержимое не изменено."); }
  if (value && typeof value === "object" && (value as { version?: unknown }).version === 1) {
    const legacy = object(value, ["version", "revision", "assessments", "history"]);
    const assessments = list(legacy.assessments, 5_000).map((row) => ({ ...object(row, ["id", "title", "kind", "subjectId", "subjectName", "groupId", "groupName", "period", "supervisorId", "roster", "attempts"]), recordBook: null }));
    const history = list(legacy.history, 50_000).map((row) => ({ ...object(row, ["id", "assessmentId", "attemptId", "actorId", "occurredAt", "action", "results"]), recordBook: null }));
    return validateDocument({ ...legacy, version: 2, assessments, history });
  }
  return validateDocument(value);
};

const validateAttemptDraft = (draft: AssessmentAttemptDraft, context: AssessmentDomainContext, roster: Set<string>, primary: boolean): string[] => {
  object(draft, ["date", "startsAt", "teacherId", "chairId", "memberIds", "studentIds"]);
  assessmentStartsAt(draft);
  const teacher = (teacherId: unknown) => id(teacherId) && context.accounts.some((account) => account.id === teacherId && account.role === "teacher" && isAccountActive(account));
  if (!teacher(draft.teacherId)) fail("Выберите активного преподавателя для заполнения ведомости.");
  const studentIds = uniqueIds(draft.studentIds, true);
  if (studentIds.some((studentId) => !roster.has(studentId)) || (primary && roster.size !== studentIds.length)) fail("Выберите студентов из исходного состава аттестации.");
  const memberIds = uniqueIds(draft.memberIds);
  if (draft.chairId !== null && !teacher(draft.chairId)) fail("Выберите активного преподавателя председателем комиссии.");
  if (memberIds.some((memberId) => !teacher(memberId)) || (draft.chairId !== null && memberIds.includes(draft.chairId))) fail("Проверьте состав комиссии: преподаватели должны быть активны и не повторяться.");
  return studentIds;
};

export const applyAssessmentCommand = (state: AssessmentDocument, command: AssessmentCommand, context: AssessmentDomainContext, generated: AssessmentGeneratedValues): AssessmentDocument => {
  validateDocument(state);
  if (!command || !["create", "add-attempt", "save-results", "publish", "update-record-book"].includes(command.type)) fail("Неизвестное действие с аттестацией.");
  const commonKeys = ["type", "actorId", "actorRevision", "expectedRevision", "accountsRevision", "groupRevision", "subjectRevision"];
  object(command, [...commonKeys, ...(command.type === "create" ? ["draft"] : command.type === "add-attempt" ? ["assessmentId", "kind", "draft"] : command.type === "save-results" ? ["assessmentId", "attemptId", "results"] : command.type === "update-record-book" ? ["assessmentId", "recordBook"] : ["assessmentId", "attemptId"])]);
  if ([command.actorRevision, command.expectedRevision, command.accountsRevision, command.groupRevision, command.subjectRevision, context.accountsRevision, context.groupRevision, context.subjectRevision].some((value) => !integer(value))) fail("Проверьте версии данных аттестации.");
  if (command.expectedRevision !== state.revision || command.accountsRevision !== context.accountsRevision || command.groupRevision !== context.groupRevision || command.subjectRevision !== context.subjectRevision) fail("Данные изменились. Обновите страницу и повторите действие.");
  if (new Set(context.accounts.map((entry) => entry.id)).size !== context.accounts.length || new Set(context.groups.map((entry) => entry.id)).size !== context.groups.length || new Set(context.subjects.map((entry) => entry.id)).size !== context.subjects.length) fail("Справочники содержат повторяющиеся идентификаторы.");
  const actor = context.accounts.find((account) => account.id === command.actorId);
  if (!actor || !isAccountActive(actor) || actor.revision !== command.actorRevision) fail("Учётная запись недоступна или изменена. Обновите страницу.");
  if (!id(generated.assessmentId) || !id(generated.attemptId) || !id(generated.historyId) || !timestamp(generated.occurredAt)) fail("Не удалось сформировать идентификаторы и дату изменения.");
  if (state.history.some((entry) => entry.id === generated.historyId) || (state.history.length && Date.parse(generated.occurredAt) < Date.parse(state.history[state.history.length - 1].occurredAt))) fail("Изменение уже существует или нарушает порядок истории.");
  const next = copy(state);
  let target: Assessment;
  let attempt: AssessmentAttempt;
  let action: AssessmentHistoryEntry["action"];
  if (command.type === "create" || command.type === "add-attempt") {
    if (actor.role !== "configurator") fail("Создавать аттестации и пересдачи может только настройщик.");
    if (state.assessments.some((entry) => entry.attempts.some((item) => item.id === generated.attemptId))) fail("Идентификатор попытки уже существует.");
    if (command.type === "create") {
      const draft = command.draft;
      object(draft, ["title", "kind", "subjectId", "groupId", "period", "attempt", ...(Object.hasOwn(draft, "recordBook") ? ["recordBook"] : [])]);
      const recordBook = validateAssessmentRecordBook(draft.recordBook ?? null);
      if (!string(draft.title, 2, 160) || !string(draft.period, 1, 120) || !kind(draft.kind)) fail("Укажите название аттестации, вид контроля и учебный период.");
      const group = context.groups.find((entry) => entry.id === draft.groupId && entry.status !== "archived");
      if (!group || !string(group.name)) fail("Выберите действующую учебную группу.");
      const subject = draft.subjectId === null ? null : context.subjects.find((entry) => entry.id === draft.subjectId);
      if (subject === undefined || (subject && !string(subject.name)) || (["exam", "pass", "gradedPass"].includes(draft.kind) && subject === null)) fail("Выберите дисциплину аттестации.");
      if (state.assessments.some((entry) => entry.id === generated.assessmentId)) fail("Идентификатор аттестации уже существует.");
      const eligible = new Map(context.accounts.filter((account) => account.role === "student" && (account.enrollmentStatus ?? "studying") === "studying" && getStudentGroupId(account) === group.id).map((account) => [account.id, account]));
      const studentIds = validateAttemptDraft(draft.attempt, context, new Set(eligible.keys()), false);
      target = { id: generated.assessmentId, title: draft.title, kind: draft.kind, subjectId: subject?.id ?? null, subjectName: subject?.name ?? null, groupId: group.id, groupName: group.name, period: draft.period, supervisorId: isSupervisedAssessment(draft.kind) ? draft.attempt.teacherId : null, recordBook, roster: studentIds.map((studentId) => { const student = eligible.get(studentId)!; return { studentId, name: student.name, studentNumber: student.studentRecord?.number ?? null }; }), attempts: [] };
      next.assessments.push(target);
      action = "created";
    } else {
      const found = next.assessments.find((entry) => entry.id === command.assessmentId);
      if (!found) fail("Аттестация не найдена.");
      target = found!;
      if (command.kind !== "retake" && command.kind !== "commission") fail("Выберите вид пересдачи.");
      const previous = target.attempts[target.attempts.length - 1];
      if (previous.state !== "published") fail("Сначала опубликуйте предыдущую ведомость.");
      if (assessmentStartsAt(command.draft) < assessmentStartsAt(previous)) fail("Дата и время пересдачи не могут быть раньше предыдущей попытки.");
      if (target.supervisorId !== null && command.draft.teacherId !== target.supervisorId) fail("Ведомости ВКР и курсовых работ заполняет назначенный научный руководитель.");
      validateAttemptDraft(command.draft, context, new Set(target.roster.map((row) => row.studentId)), false);
      action = "attempt-created";
    }
    const draft = command.type === "create" ? command.draft.attempt : command.draft;
    const attemptKind = command.type === "create" ? "primary" : command.kind;
    if (attemptKind === "commission" ? draft.chairId === null || !draft.memberIds.length : draft.chairId !== null || draft.memberIds.length !== 0) fail("Для комиссионной попытки укажите председателя и хотя бы одного члена. У обычной попытки комиссии быть не должно.");
    attempt = { id: generated.attemptId, number: target!.attempts.length + 1, kind: attemptKind, date: draft.date, startsAt: draft.startsAt, teacherId: draft.teacherId, chairId: draft.chairId, memberIds: [...draft.memberIds], studentIds: [...draft.studentIds], results: draft.studentIds.map((studentId) => ({ studentId, outcome: null })), state: "draft", createdAt: generated.occurredAt, createdBy: actor.id, publishedAt: null, publishedBy: null };
    target!.attempts.push(attempt);
  } else if (command.type === "update-record-book") {
    if (actor.role !== "configurator") fail("Реквизиты зачётки изменяет только настройщик.");
    const found = next.assessments.find((entry) => entry.id === command.assessmentId);
    if (!found) fail("Аттестация не найдена.");
    const metadata = validateAssessmentRecordBook(command.recordBook);
    if (!metadata || sameRecordBook(found!.recordBook, metadata)) fail("Укажите изменённые реквизиты зачётки.");
    target = found!; target.recordBook = copy(metadata); attempt = target.attempts[0]; action = "record-book-updated";
  } else {
    const found = next.assessments.find((entry) => entry.id === command.assessmentId);
    const foundAttempt = found?.attempts.find((entry) => entry.id === command.attemptId);
    if (!found || !foundAttempt) fail("Ведомость не найдена.");
    target = found!; attempt = foundAttempt!;
    if (actor.role !== "teacher" || attempt.teacherId !== actor.id) fail("Заполнять ведомость может только назначенный преподаватель.");
    if (attempt.state !== "draft") fail("Опубликованная ведомость закрыта для изменений.");
    if (!canRecordAssessmentResults(attempt, generated.occurredAt)) fail("Заполнять и публиковать результаты можно начиная с назначенных даты и времени аттестации по Москве.");
    if (command.type === "save-results") {
      attempt.results = copy(results(command.results, attempt.studentIds, target.kind));
      action = "results-saved";
    } else {
      if (attempt.results.some((row) => row.outcome === null)) fail("Заполните результат каждого участника перед публикацией.");
      attempt.state = "published"; attempt.publishedAt = generated.occurredAt; attempt.publishedBy = actor.id;
      action = "published";
    }
  }
  next.revision += 1;
  next.history.push({ id: generated.historyId, assessmentId: target!.id, attemptId: attempt!.id, actorId: actor.id, occurredAt: generated.occurredAt, action: action!, results: action! === "results-saved" || action! === "published" ? copy(attempt!.results) : null, recordBook: copy(target!.recordBook) });
  return validateDocument(next);
};

/** Role projections never expose draft marks or another student's identity through a roster. */
export const projectAssessments = (state: AssessmentDocument, actor: PortalAccount): Assessment[] => {
  validateDocument(state);
  if (!isAccountActive(actor)) fail("Учётная запись заблокирована.");
  if (actor.role === "configurator") return copy(state.assessments);
  if (actor.role !== "teacher" && actor.role !== "student") fail("Недостаточно прав для просмотра аттестаций.");
  return state.assessments.flatMap((assessment) => {
    const visible = assessment.attempts.filter((attempt) => actor.role === "teacher" ? attempt.teacherId === actor.id : attempt.state === "published" && attempt.studentIds.includes(actor.id));
    if (!visible.length) return [];
    const students = actor.role === "student" ? new Set([actor.id]) : new Set(visible.flatMap((attempt) => attempt.studentIds));
    return [copy({ ...assessment, roster: assessment.roster.filter((student) => students.has(student.studentId)), attempts: visible.map((attempt) => ({ ...attempt, studentIds: attempt.studentIds.filter((studentId) => students.has(studentId)), results: attempt.results.filter((result) => students.has(result.studentId)) })) })];
  });
};
