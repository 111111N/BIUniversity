import { checkBackupAbort, type AdministrativeBackup } from "./localBackup";
import type { BackupDocumentCheck, BackupDocumentIssue } from "./localBackupDocuments";
import type { JournalChange } from "../data/journalStore";
import { getJournalHistoryValueIssues } from "./journalHistoryValues";
import { inspectJournalHistoryChain } from "./journalHistoryChain";
import { inspectJournalHistorySnapshot } from "./journalHistorySnapshot";
import type { Student } from "../components/Attendance/data/students";
import { resolveJournalTeachingArea, type ArchivedJournalCatalogs, type JournalTeachingArea } from "./journalTeachingArea";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import { createArchivedJournalLessonIndex, inspectJournalLessonReferences, type JournalLessonReference } from "./journalLessonReferences";
import { inspectJournalPeopleReferences, type JournalPersonReference } from "./journalPeopleReferences";
import { inspectJournalActorContexts } from "./journalActorContexts";

export const BACKUP_JOURNAL_DOCUMENTS = {
  journals: { key: "bi-university-journal-v1:", prefix: "bi-university-journal-", label: "Журналы" },
  journalHistory: { key: "bi-university-journal-history-v1:", prefix: "bi-university-journal-history-", label: "История журналов" },
} as const;
type Kind = keyof typeof BACKUP_JOURNAL_DOCUMENTS;
interface JournalContext extends ArchivedJournalCatalogs {
  lessonSource?: { schedule?: ManagedScheduleSnapshot };
  peopleSource?: { accountIds?: ReadonlySet<string> };
}
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const attendance = (value: unknown) => typeof value === "string" && ["unmarked", "present", "sick", "absent"].includes(value);
const grade = (value: unknown) => value === null || (typeof value === "number" && [2, 3, 4, 5].includes(value));
const cell = (value: unknown) => value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
const validActor = (value: unknown) => isRecord(value) && nonempty(value.id) && typeof value.name === "string"
  && (value.role === undefined || ["student", "teacher", "configurator"].includes(value.role as string))
  && (value.memberships === undefined || (Array.isArray(value.memberships) && value.memberships.every((membership: unknown) => isRecord(membership)
    && nonempty(membership.subjectId) && Array.isArray(membership.groupIds) && membership.groupIds.every(nonempty))));

export const getBackupJournalKind = (key: string): Kind | undefined => key.startsWith(BACKUP_JOURNAL_DOCUMENTS.journalHistory.prefix)
  ? "journalHistory" : key.startsWith(BACKUP_JOURNAL_DOCUMENTS.journals.prefix) ? "journals" : undefined;

const decodeJournalRows = (raw: string): unknown[] => {
  const parsed: unknown = JSON.parse(raw);
  const rows = isRecord(parsed) && parsed.version === 2 ? parsed.students : parsed;
  if (!Array.isArray(rows) || !rows.every((row: unknown) => isRecord(row) && nonempty(row.id) && typeof row.name === "string"
    && isRecord(row.attendance) && Object.entries(row.attendance).every(([key, value]) => nonempty(key) && attendance(value))
    && isRecord(row.grades) && Object.entries(row.grades).every(([key, value]) => nonempty(key) && grade(value)))) {
    throw new Error("Не читается схема журнала: поддерживаются массив студентов и документ версии 2 с корректными отметками и оценками.");
  }
  return rows;
};

const decodeHistoryRows = (raw: string): unknown[] => {
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || !rows.every((row: unknown) => isRecord(row) && nonempty(row.id)
    && typeof row.changedAt === "string" && Number.isFinite(Date.parse(row.changedAt))
    && nonempty(row.studentId) && typeof row.studentName === "string"
    && (row.lessonId === undefined || nonempty(row.lessonId))
    && ["attendance", "grade", "roster", "demo"].includes(row.field as string)
    && cell(row.previousValue) && cell(row.nextValue) && validActor(row.actor))) {
    throw new Error("Не читается схема истории журнала: проверьте ID, даты, автора и поля изменений. Повреждённые события не отбрасывались.");
  }
  return rows;
};

/** Inspect every saved list as-is; never consult accounts, create demos or migrate lesson keys. */
export const inspectBackupJournals = async (entries: AdministrativeBackup["localStorage"], signal?: AbortSignal, catalogs?: JournalContext) => {
  const issues: BackupDocumentIssue[] = [];
  const checks: BackupDocumentCheck[] = [];
  const stats: Record<Kind, { documents: number; invalid: number; records: number }> = {
    journals: { documents: 0, invalid: 0, records: 0 }, journalHistory: { documents: 0, invalid: 0, records: 0 },
  };
  let count = 0; let historyComparisons = 0;
  let snapshotComparisons = 0; let unresolvedCells = 0;
  const journals = new Map<string, Student[]>(); const histories = new Map<string, JournalChange[]>();
  const journalKeys = new Set<string>();
  const areas = { journals: { matched: 0, unresolved: 0 }, journalHistory: { matched: 0, unresolved: 0 } };
  const lessonStats = { journals: { matched: 0, unresolved: 0 }, journalHistory: { matched: 0, unresolved: 0 } };
  const peopleStats = { journals: { matched: 0, missing: 0, unchecked: 0 }, journalHistory: { matched: 0, missing: 0, unchecked: 0 } };
  const actorStats = { consistent: 0, conflicting: 0, incomplete: 0, uncheckedArea: 0 };
  const lessonIndex = catalogs?.lessonSource ? await createArchivedJournalLessonIndex(catalogs.lessonSource.schedule, signal) : undefined;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  for (const entry of entries) {
    await step();
    const kind = getBackupJournalKind(entry.key);
    if (!kind) continue;
    const current = stats[kind]; const definition = BACKUP_JOURNAL_DOCUMENTS[kind];
    if (kind === "journals") journalKeys.add(entry.key);
    current.documents++;
    if (!entry.key.startsWith(definition.key) || !entry.key.slice(definition.key.length)) {
      current.invalid++;
      issues.push({ kind, level: "error", code: "unsupported-journal-key", referenceId: entry.key, message: "Ключ журнала или истории не поддерживается либо не содержит учебную область. Список не заменён данными браузера." });
      continue;
    }
    let area: JournalTeachingArea = { status: "unavailable" };
    if (catalogs) {
      area = await resolveJournalTeachingArea(entry.key.slice(definition.key.length), catalogs, signal);
      if (area.status === "matched") areas[kind].matched++;
      else {
        areas[kind].unresolved++;
        issues.push({ kind, level: "review", code: `${area.status}-journal-area`, referenceId: entry.key,
          message: area.status === "unavailable"
            ? "Учебная область ключа не проверена: каталог дисциплин или групп отсутствует либо не читается в архиве. Справочники браузера и встроенные группы не подставлялись."
            : area.status === "ambiguous"
              ? "Ключ допускает несколько пар ID дисциплины и группы из каталогов архива. Учебная область неоднозначна; разделитель не выбран автоматически, списки не переименованы и не объединены."
              : "Ключ не удалось однозначно связать с парой ID дисциплины и группы из каталогов архива. Историческая связь требует проверки; названия, текущие назначения и встроенные группы не подставлялись.",
        });
      }
    }
    let rows: unknown[];
    try {
      rows = kind === "journals" ? decodeJournalRows(entry.raw) : decodeHistoryRows(entry.raw);
      const ids = rows.map((row) => (row as { id: string }).id);
      if (new Set(ids).size !== ids.length) throw new Error("В списке журнала или истории повторяются ID записей. Дубликаты не объединялись и не удалялись.");
      current.records += rows.length;
    } catch (error) {
      current.invalid++;
      issues.push({ kind, level: "error", code: "invalid-journal-document", referenceId: entry.key,
        message: error instanceof SyntaxError ? "Некорректный JSON внутри списка. Исходное содержимое не включено в отчёт." : error instanceof Error ? error.message : "Не удалось проверить список журнала или истории.",
      });
      continue;
    }
    if (catalogs?.peopleSource) {
      const references = function* (): Generator<JournalPersonReference> {
        if (kind === "journalHistory") {
          for (const row of rows as JournalChange[]) {
            yield { accountId: row.actor.id, recordId: row.id, target: "actor" };
            // A demo event describes a batch, not an individual student's record.
            if (row.field !== "demo") yield { accountId: row.studentId, recordId: row.id, target: "student" };
          }
        } else {
          for (const student of rows as Student[]) yield { accountId: student.id, recordId: student.id, target: "student" };
        }
      };
      const people = await inspectJournalPeopleReferences(references(), catalogs.peopleSource.accountIds, signal);
      peopleStats[kind].matched += people.matched; peopleStats[kind].missing += people.missing; peopleStats[kind].unchecked += people.unchecked;
      for (const finding of people.issues) issues.push({ ...finding, kind, referenceId: entry.key });
    }
    if (lessonIndex) {
      const references = function* (): Generator<JournalLessonReference> {
        if (kind === "journalHistory") {
          for (const row of rows as JournalChange[]) if ((row.field === "attendance" || row.field === "grade") && row.lessonId !== undefined) yield { lessonId: row.lessonId, recordId: row.id };
        } else {
          for (const student of rows as Student[]) {
            for (const lessonId of new Set([...Object.keys(student.attendance), ...Object.keys(student.grades)])) yield { lessonId, recordId: JSON.stringify([student.id, lessonId]) };
          }
        }
      };
      const lessons = await inspectJournalLessonReferences(references(), lessonIndex, area, signal);
      lessonStats[kind].matched += lessons.matched; lessonStats[kind].unresolved += lessons.unresolved;
      for (const finding of lessons.issues) issues.push({ ...finding, kind, referenceId: entry.key });
    }
    if (kind === "journals") journals.set(entry.key, rows as Student[]);
    if (kind === "journalHistory") {
      histories.set(entry.key, rows as JournalChange[]);
      if (catalogs) {
        const contexts = await inspectJournalActorContexts(rows as JournalChange[], area, signal);
        actorStats.consistent += contexts.consistent; actorStats.conflicting += contexts.conflicting;
        actorStats.incomplete += contexts.incomplete; actorStats.uncheckedArea += contexts.uncheckedArea;
        for (const finding of contexts.issues) issues.push({ kind, level: finding.level, code: finding.code, message: finding.message, referenceId: entry.key, recordId: finding.id });
      }
      for (const row of rows as JournalChange[]) {
        await step();
        for (const finding of getJournalHistoryValueIssues(row)) issues.push({ ...finding, kind, referenceId: entry.key, recordId: row.id });
      }
      const chain = await inspectJournalHistoryChain(rows as JournalChange[], signal); historyComparisons += chain.comparedPairs;
      for (const finding of chain.issues) issues.push({ kind, level: finding.level, code: finding.code, message: finding.message, referenceId: entry.key, recordId: finding.id });
    }
  }
  for (const [key, rows] of histories) {
    await step();
    const journalKey = BACKUP_JOURNAL_DOCUMENTS.journals.key + key.slice(BACKUP_JOURNAL_DOCUMENTS.journalHistory.key.length);
    const students = journals.get(journalKey);
    const snapshot = await inspectJournalHistorySnapshot(rows, students ? { status: "readable", students }
      : { status: journalKeys.has(journalKey) ? "invalid" : "absent" }, signal);
    snapshotComparisons += snapshot.comparedCells; unresolvedCells += snapshot.unresolvedCells;
    for (const finding of snapshot.issues) issues.push({ kind: "journalHistory", level: finding.level, code: finding.code, message: finding.message,
      referenceId: key, ...(finding.id === undefined ? {} : { recordId: finding.id }),
    });
  }
  checkBackupAbort(signal);
  for (const kind of Object.keys(stats) as Kind[]) {
    const current = stats[kind]; const definition = BACKUP_JOURNAL_DOCUMENTS[kind];
    checks.push({ kind, key: definition.key, label: definition.label, documents: current.documents,
      status: !current.documents ? "absent" : current.invalid ? "invalid" : "valid",
      ...(current.documents && !current.invalid ? { records: current.records } : {}),
      message: !current.documents ? "Сохранённых списков этой области нет в архиве. Данные браузера и встроенные примеры не подставляются."
        : `Списков: ${current.documents}; прочитано: ${current.documents - current.invalid}; не читается: ${current.invalid}. Проверена структура${kind === "journalHistory" ? " и соответствие значений типу события" : ""}; исторический состав группы и права ещё не подтверждены.`
          + (kind === "journalHistory" ? ` Сопоставлено пар соседних изменений из читаемых списков: ${historyComparisons}. Начало истории не дополняется; события состава и демонстрационного заполнения считаются границами проверки. Сверено последних применимых изменений с ячейками архивных журналов: ${snapshotComparisons}; не удалось сверить: ${unresolvedCells}. Сопоставляются только точные ключи парных списков; полнота журнала и права не подтверждены.` : "")
          + (catalogs ? ` Поддерживаемых ключей с однозначной парой ID из каталогов архива: ${areas[kind].matched}; учебная область не подтверждена: ${areas[kind].unresolved}. Совпадение пары ID само по себе не подтверждает занятие, состав группы или права автора.`
            : " Связь ключей с каталогами дисциплин и групп не проверялась.")
          + (lessonIndex ? ` Связей с сохранёнными занятиями своей дисциплины и группы: ${lessonStats[kind].matched}; не подтверждено: ${lessonStats[kind].unresolved}. В журнале отметка и оценка одного студента за одно занятие считаются одной ссылкой; в истории каждое событие считается отдельно. Состав группы и права автора не проверены.`
            : " Ссылки на конкретные занятия не проверялись.")
          + (catalogs?.peopleSource ? ` Ссылок на ID учёток архива: найдено ${peopleStats[kind].matched}; отсутствует ${peopleStats[kind].missing}; не проверено ${peopleStats[kind].unchecked}.`
            + (kind === "journalHistory" ? " У каждого события учитываются автор и студент; у демонстрационного заполнения только автор." : " Учитывается ID каждой строки студента.")
            + " Совпадение ID не подтверждает историческую роль, состояние обучения, группу или права."
            : " Ссылки на учётки студентов и авторов не проверялись.")
          + (kind !== "journalHistory" ? "" : catalogs
            ? ` Сохранённый контекст автора: соответствует текущему контракту ${actorStats.consistent}; расходится ${actorStats.conflicting}; не хватает данных ${actorStats.incomplete}; не определена область ${actorStats.uncheckedArea}. Это сверка утверждений внутри события, а не подтверждение реальных прав на его дату.`
            : " Сохранённый контекст автора не сверялся с контрактом записи журнала."),
    });
  }
  return { checks, issues };
};
