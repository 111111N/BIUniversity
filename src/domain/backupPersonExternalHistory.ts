import type { AccountsDocument } from "./accounts";
import { createBackupIssueCollector } from "./backupIssueCollector";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";
import { getPersonExternalReferenceKey } from "./personExternalReference";
import { isCanonicalBackupInstant } from "./backupHistoryTime";

/** Only explicit historical snapshots establish ownership; current legacy cards do not supply an earlier baseline. */
export async function inspectArchivedPersonExternalHistory(document: AccountsDocument, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("историческим внешним ID людей"), budget = createBackupBudget();
  let work = 0, checked = 0, collisions = 0, conflictingEvents = 0, future = 0, legacy = 0, uncertainDates = 0;
  const step = async () => {
    if (++work > BACKUP_LIMITS.nodes) throw new Error("Проверка исторических внешних ID людей превышает предел операций. Частичный результат не создан.");
    if (work % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const finding = (level: "error" | "review", code: string, message: string, recordId?: string, referenceId?: string) => add({ kind: "accounts", level, code, message, ...(recordId === undefined ? {} : { recordId }), ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    checkBackupAbort(signal);
    const persons = document.persons ?? [], history = document.personHistory ?? [];
    for (const rows of [persons, history, document.accounts]) if (rows.length > BACKUP_LIMITS.records) throw new Error("Источник истории людей превышает 25 000 записей. Частичный результат не создан.");
    if (document.version !== 2) {
      if (document.accounts.length) finding("review", "unchecked-legacy-person-external-history", "В старом источнике учёток нет отдельной истории людей. Внешние ID и прежние связи не создавались из текущих имён или учётных записей.");
      return { issues, summary: "Исторические внешние ID: отдельная история людей отсутствует в старой схеме; миграция не выполнялась." };
    }
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff) || !isCanonicalBackupInstant(completedAt)) throw new Error("Не определена точная граница проверки исторических внешних ID людей.");
    for (const person of persons) { await step(); if (person.legacyAccountId !== undefined) legacy++; }
    const currentKeys = new Map<string, string>(), owners = new Map<string, Set<string>>();
    let previous = -Infinity;
    for (const event of history) {
      await step(); const time = Date.parse(event.occurredAt);
      if (!Number.isFinite(time) || time < previous) throw new Error("Нарушен порядок истории людей для проверки внешних ID.");
      previous = time; addBackupText(budget, event.personId);
      if (!isCanonicalBackupInstant(event.occurredAt)) {
        uncertainDates++;
        const key = currentKeys.get(event.personId);
        if (key) { const prior = owners.get(key)!; prior.delete(event.personId); if (!prior.size) owners.delete(key); }
        currentKeys.delete(event.personId);
        finding("review", "unconfirmed-person-external-event-instant", "Дата старого изменения человека не подтверждает канонический момент. Прежнее владение этой карточки сброшено до следующего пригодного явного снимка; полночь и новое владение не достраивались.", event.id, event.personId);
        continue;
      }
      if (time > cutoff) {
        future++;
        finding("error", "person-event-after-backup", "Изменение человека сохранено позже завершения архива и не использовано для исторического владения внешним ID.", event.id, event.personId);
        continue;
      }
      const beforeKey = currentKeys.get(event.personId);
      if (beforeKey) {
        const prior = owners.get(beforeKey)!; prior.delete(event.personId); if (!prior.size) owners.delete(beforeKey);
      }
      const key = getPersonExternalReferenceKey(event.snapshot.externalReference);
      addBackupText(budget, key); checked++;
      currentKeys.set(event.personId, key);
      if (!key) continue;
      const otherOwners = owners.get(key) ?? new Set<string>();
      if (otherOwners.size) conflictingEvents++;
      for (const id of otherOwners) {
        await step(); collisions++;
        finding("error", "duplicate-historical-person-external-reference", "Внешний ID с тем же источником уже принадлежал другому человеку по предшествующему явному снимку. Действующее правило запрещает такое создание или изменение; последующее исправление не отменяет исторический конфликт.", event.id, id);
      }
      otherOwners.add(event.personId); owners.set(key, otherOwners);
    }
    if (legacy) finding("review", "unconfirmed-legacy-person-external-baseline", "Исходные внешние ID перенесённых людей не сохранены отдельным ранним снимком. Их текущее значение не подставлялось до первого явного изменения человека.");
    if (persons.length || history.length) finding("review", "unconfirmed-person-account-historical-links", "Сверка внешних ID не подтверждает прежние связи людей с учётками, исторические полномочия и полноту ранних данных. Совпадение имён не объединяет людей, несколько учёток одного человека остаются допустимыми.");
    checkBackupAbort(signal);
    return { issues, summary: `Исторические внешние ID: явных снимков до границы ${checked}; событий с конфликтом ${conflictingEvents}; сопоставлений конфликтующих владельцев ${collisions}; событий после границы ${future}; перенесённых людей без раннего снимка ${legacy}; нестандартных дат ${uncertainDates}. Исторические связи учёток и права этим не подтверждены.` };
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось проверить исторические внешние ID людей:", error);
    throw error;
  }
}
