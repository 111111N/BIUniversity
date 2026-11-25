import { createBackupIssueCollector } from "./backupIssueCollector";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import type { TeachingAssignment, TeachingAssignmentsDocument } from "./teachingAssignments";

const areaKey = (row: { teacherId: string; subjectId: string; groupId: string }) => JSON.stringify([row.teacherId, row.subjectId, row.groupId]);
const versionKey = (id: string, revision: number | undefined) => JSON.stringify([id, revision]);

/** Checks chronology of existing references; missing legacy references never acquire an invented revision. */
export async function inspectArchivedTeachingPublicationVersions(document: TeachingAssignmentsDocument, schedule: ManagedScheduleSnapshot | undefined, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("хронологии ссылок публикаций на назначения"), budget = createBackupBudget();
  let work = 0, copies = 0, matched = 0, unrefined = 0, missing = 0, invalid = 0, unresolved = 0, ambiguous = 0, baselines = 0;
  const step = async () => {
    if (++work > BACKUP_LIMITS.nodes) throw new Error("Сверка ссылок публикаций на назначения превышает предел операций. Частичный результат не создан.");
    if (work % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const finding = (level: "error" | "review", code: string, message: string, recordId?: string, referenceId?: string) => add({ kind: "teachingAssignments", level, code, message, ...(recordId === undefined ? {} : { recordId }), ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    checkBackupAbort(signal);
    const publications = schedule?.publications ?? [];
    for (const rows of [document.history, publications]) if (rows.length > BACKUP_LIMITS.records) throw new Error("Источник хронологии ссылок публикаций превышает 25 000 событий. Частичный результат не создан.");
    if (!publications.length) {
      if (document.history.length) finding("review", schedule ? "unchecked-publication-teaching-chronology" : "missing-publication-teaching-chronology-source", schedule ? "История публикаций отсутствует или пуста; выбранные при публикации ревизии назначений не определялись по текущим карточкам." : "Источник расписания отсутствует; хронология его ссылок на назначения не проверена.");
      return { issues, summary: "Хронология ссылок публикаций на назначения: версий публикаций нет. Текущие карточки не заменяют историю." };
    }
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff)) throw new Error("Не определена граница сверки хронологии ссылок публикаций.");
    const versions = new Map<string, { assignment: TeachingAssignment; time: number }>(), ties = new Set<string>();
    let previous = -Infinity;
    for (const event of document.history) {
      await step(); const time = Date.parse(event.occurredAt), key = versionKey(event.after.id, event.after.revision), scope = areaKey(event.after);
      if (!Number.isFinite(time) || time < previous || versions.has(key)) throw new Error("Нарушена хронология или уникальность версий назначений для ссылок расписания.");
      previous = time;
      versions.set(key, { assignment: event.after, time });
      addBackupText(budget, key); addBackupText(budget, scope);
      const tie = JSON.stringify([time, scope]);
      if (!ties.has(tie)) addBackupText(budget, tie);
      ties.add(tie);
    }
    const current = new Map<string, TeachingAssignment>(), baselineIds = new Set<string>();
    let position = 0; previous = -Infinity;
    for (const publication of publications) {
      await step(); const time = Date.parse(publication.occurredAt);
      if (!Number.isFinite(time) || time < previous) throw new Error("Нарушен порядок публикаций при сверке ссылок на назначения.");
      previous = time; copies += publication.week.lessons.length;
      if (copies > BACKUP_LIMITS.records) throw new Error("Копий занятий для сверки ссылок больше 25 000. Частичный результат не создан.");
      addBackupText(budget, publication.id);
      if (time <= cutoff) while (position < document.history.length && Date.parse(document.history[position].occurredAt) < time) {
        await step(); const event = document.history[position++]; current.set(areaKey(event.after), event.after);
      }
      const ids = new Set<string>();
      for (const lesson of publication.week.lessons) {
        await step();
        if (ids.has(lesson.id) || publication.origin === "saved-snapshot" && baselineIds.has(lesson.id)) throw new Error("Версия публикации или общий начальный снимок содержат повторяющийся ID занятия. Хронология ссылок не выбрана по последней копии; частичный результат не создан.");
        ids.add(lesson.id); if (publication.origin === "saved-snapshot") baselineIds.add(lesson.id);
        const scope = areaKey(lesson);
        addBackupText(budget, JSON.stringify([lesson.id, scope, lesson.teachingAssignmentId, lesson.teachingAssignmentRevision]));
        if (time > cutoff) continue;
        const declared = lesson.teachingAssignmentId === undefined ? undefined : versions.get(versionKey(lesson.teachingAssignmentId, lesson.teachingAssignmentRevision));
        // Missing/foreign versions already receive structural errors in the base assignment inspection.
        if (lesson.teachingAssignmentId !== undefined && (!declared || areaKey(declared.assignment) !== scope)) { unresolved++; continue; }
        if (declared && declared.time > time) {
          invalid++;
          finding("error", "publication-teaching-version-from-future", "Ссылка занятия указывает на ревизию назначения, сохранённую позже этой публикации или захвата начального снимка.", publication.id, lesson.id);
          continue;
        }
        if (publication.origin === "saved-snapshot") continue;
        if (ties.has(JSON.stringify([time, scope]))) {
          ambiguous++;
          finding("review", "ambiguous-publication-teaching-version", "Публикация и изменение связанного назначения имеют одинаковое время; выбранная ревизия не определена порядком разных документов.", publication.id, lesson.id);
          continue;
        }
        const expected = current.get(scope);
        if (lesson.teachingAssignmentId === undefined) {
          if (!expected) unrefined++;
          else {
            missing++;
            finding("review", "missing-historical-publication-teaching-reference", "До публикации уже существовало явное назначение, но ссылка на его ревизию не сохранена. Неизвестная старая схема не дополнена текущей версией.", publication.id, lesson.id);
          }
        } else if (!expected || !declared || expected.id !== declared.assignment.id || expected.revision !== declared.assignment.revision) {
          invalid++;
          finding("error", "stale-publication-teaching-version", "По действующему правилу публикации ссылка занятия должна указывать на последнюю предшествующую ревизию назначения; в архиве указана уже заменённая версия.", publication.id, lesson.id);
        } else matched++;
      }
      if (time > cutoff) finding("review", "unchecked-publication-teaching-version-after-cutoff", "Публикация позже границы архива не использована для вывода о выбранной ревизии назначения.", publication.id);
      else if (publication.origin === "saved-snapshot" && publication.week.lessons.length) {
        baselines++;
        finding("review", "unconfirmed-baseline-teaching-version-selection", "Начальный снимок подтверждает только наличие сохранённой ссылки при захвате. Время и выбор ревизии при исходной публикации по нему не восстанавливались.", publication.id);
      }
    }
    finding("review", "unconfirmed-publication-teaching-selection-authority", "Хронология ссылок не подтверждает старые общие назначения учёток, полномочия публикации и полноту ранних данных. Текущие роли, карточки и оставшиеся записи журнала не подставлялись в прошлое.");
    checkBackupAbort(signal);
    return { issues, summary: `Хронология ссылок публикаций: копий занятий ${copies}; совпавших ревизий ${matched}; без прежнего явного назначения ${unrefined}; отсутствующих старых ссылок ${missing}; будущих или заменённых ревизий ${invalid}; структурно неподтверждённых ссылок ${unresolved}; одновременных событий ${ambiguous}; начальных снимков ${baselines}. Исторические права и полнота ранних данных этим не подтверждены.` };
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось проверить хронологию ссылок публикаций на назначения преподавателей:", error);
    throw error;
  }
}
