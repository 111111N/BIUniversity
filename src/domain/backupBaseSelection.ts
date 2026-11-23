import { getBackupDifferenceKey, type BackupDifferenceReference } from "./backupComparison";
import { BackupRecordDecodeError, type BackupRecordEntries } from "./backupRecordComparison";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget, encodeBackupValue } from "./localBackup";
import { canonicalBackupValue } from "./localBackupValidation";
import type { BackupDocumentKind } from "./localBackupDocuments";

export interface BaseRecordChoice { key: string; version: "archive" | "browser" }
type Collection = Extract<BackupDifferenceReference, { storage: "localStorage-record" | "localStorage-journal-record" | "localStorage-child-record" }>["collection"];
export interface BaseSelectionDefinition {
  key: string; prefix: string; kind: BackupDocumentKind; label: string; exactKey?: boolean;
  decode(raw: string): object;
  collections: readonly { collection: Collection; ordered?: boolean; relativeOrder?: boolean; read(document: object): readonly object[]; parentId?(value: object): string; project?(value: object): object }[];
  metadata(document: object): object;
}
export interface BaseSelectionReview {
  key: string; label: string; status: "matched" | "blocked" | "absent";
  source?: "archive" | "browser" | "both";
  countsComplete: boolean;
  counts: { same: number; archiveOnly: number; browserOnly: number; conflicts: number; unresolved: number };
  issues: { code: "invalid-source" | "invalid-choice" | "unresolved-conflicts" | "incompatible-order" | "different-metadata" | "no-complete-source" | "ambiguous-source"; message: string }[];
}
export interface BaseSelectionResult { review: BaseSelectionReview; document?: object }
export type SelectedBaseDocuments = ReadonlyMap<string, BaseSelectionResult>;

/** Match a complete saved source; never synthesize counters, audit order or a mixed document. */
export async function resolveBackupBaseSelection(archive: BackupRecordEntries, browser: BackupRecordEntries, choices: readonly BaseRecordChoice[], definition: BaseSelectionDefinition, signal?: AbortSignal): Promise<BaseSelectionResult> {
  const review: BaseSelectionReview = { key: definition.key, label: definition.label, status: "blocked", countsComplete: false, counts: { same: 0, archiveOnly: 0, browserOnly: 0, conflicts: 0, unresolved: 0 }, issues: [] };
  const reject = (code: BaseSelectionReview["issues"][number]["code"], message: string): BaseSelectionResult => { review.issues.push({ code, message }); return { review }; };
  const textBudget = createBackupBudget(), valueBudget = createBackupBudget();
  let steps = 0;
  const checkpoint = async () => { if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const fingerprint = async (value: object) => canonicalBackupValue(await encodeBackupValue(value, valueBudget, signal));
  const read = (entries: BackupRecordEntries) => {
    const rows = entries.filter(row => definition.exactKey ? row.key === definition.key : row.key.startsWith(definition.prefix));
    if (!rows.length) return undefined;
    if (rows.length !== 1 || rows[0].key !== definition.key) throw new Error("Неоднозначный ключ базового источника.");
    addBackupText(textBudget, rows[0].key); addBackupText(textBudget, rows[0].raw);
    return definition.decode(rows[0].raw);
  };
  checkBackupAbort(signal);
  try {
    const left = read(archive), right = read(browser);
    if (!Array.isArray(choices) || choices.length > BACKUP_LIMITS.records) return reject("invalid-choice", "Список выбора некорректен или превышает предел проверки.");
    const selectedChoices = new Map<string, BaseRecordChoice["version"]>();
    for (const choice of choices) {
      await checkpoint();
      if (!choice || typeof choice.key !== "string" || !["archive", "browser"].includes(choice.version) || selectedChoices.has(choice.key)) return reject("invalid-choice", "Выбор повторяется или содержит неподдерживаемую версию. Проверьте архив заново.");
      addBackupText(textBudget, choice.key);
      selectedChoices.set(choice.key, choice.version);
    }
    if (!left && !right) {
      if (choices.length) return reject("invalid-choice", "Для отсутствующего базового источника сохранился выбор записей.");
      review.status = "absent"; review.countsComplete = true; return { review };
    }
    let matchesLeft = Boolean(left), matchesRight = Boolean(right);
    const used = new Set<string>();
    for (const collection of definition.collections) {
      const index = async (document: object | undefined) => {
        const result = new Map<string, { fingerprint: string; position: number; scope: string }>();
        for (const [position, value] of (document ? collection.read(document) : []).entries()) {
          await checkpoint();
          if (++valueBudget.records > BACKUP_LIMITS.records) throw new Error("Базовый источник превышает предел проверки.");
          const row = value as { id?: string; subjectId?: string; groupId?: string };
          if (!row.id || typeof row.id !== "string") throw new Error("Запись базового источника не имеет ID.");
          let reference: BackupDifferenceReference;
          if (collection.collection === "schedule-journal") {
            if (typeof row.subjectId !== "string" || typeof row.groupId !== "string") throw new Error("Не задана область связи журнала.");
            reference = { storage: "localStorage-journal-record", key: definition.key, collection: "schedule-journal", id: row.id, subjectId: row.subjectId, groupId: row.groupId };
          } else if (collection.collection === "submission-attempts") {
            const parentId = collection.parentId?.(value);
            if (typeof parentId !== "string" || !parentId.trim() || !collection.project) throw new Error("Не задан ответ для сохранённой попытки.");
            reference = { storage: "localStorage-child-record", key: definition.key, collection: collection.collection, parentId, id: row.id };
          } else reference = { storage: "localStorage-record", key: definition.key, collection: collection.collection, id: row.id };
          const key = getBackupDifferenceKey({ kind: "different", area: "", id: row.id, reference });
          if (result.has(key)) throw new Error("В базовом источнике повторяется адрес записи.");
          result.set(key, { fingerprint: await fingerprint(collection.project ? collection.project(value) : value), position, scope: reference.storage === "localStorage-child-record" ? reference.parentId : "" });
        }
        return result;
      };
      const a = await index(left), b = await index(right), wanted = new Map<string, string>();
      if (collection.relativeOrder) {
        // Attempt order belongs to its response, independently of the parent list order.
        const common = new Map<string, string[]>(), positions = new Map<string, number>();
        for (const [key, row] of b) {
          await checkpoint(); if (!a.has(key)) continue;
          const keys = common.get(row.scope) ?? []; keys.push(key); common.set(row.scope, keys);
        }
        for (const [key, row] of a) {
          await checkpoint();
          if (!b.has(key)) continue;
          const position = positions.get(row.scope) ?? 0; positions.set(row.scope, position + 1);
          if (key !== common.get(row.scope)?.[position]) return reject("incompatible-order", "Общие события списков имеют разный относительный порядок. История не сортировалась и не объединялась.");
        }
      }
      for (const key of new Set([...a.keys(), ...b.keys()])) {
        await checkpoint();
        const first = a.get(key), second = b.get(key), choice = selectedChoices.get(key);
        if (first && second && first.fingerprint !== second.fingerprint) {
          review.counts.conflicts++;
          if (!choice) { review.counts.unresolved++; continue; }
          used.add(key); wanted.set(key, (choice === "archive" ? first : second).fingerprint);
        } else {
          if (choice) return reject("invalid-choice", "Выбор относится к отсутствующему или совпадающему конфликту. Проверьте архив заново.");
          if (!first) review.counts.browserOnly++; else if (!second) review.counts.archiveOnly++; else review.counts.same++;
          wanted.set(key, (second ?? first)!.fingerprint);
        }
        if (collection.ordered && first && second && first.fingerprint === second.fingerprint && first.position !== second.position) return reject("incompatible-order", "Общие события имеют разные позиции. Порядок истории и публикаций автоматически не изменялся.");
      }
      const matches = (rows: typeof a) => rows.size === wanted.size && [...wanted].every(([key, value]) => rows.get(key)?.fingerprint === value);
      matchesLeft &&= matches(a); matchesRight &&= matches(b);
    }
    review.countsComplete = true;
    if (review.counts.unresolved) return reject("unresolved-conflicts", "Сначала просмотрите различающиеся записи базового документа и выберите их версии.");
    if (used.size !== selectedChoices.size) return reject("invalid-choice", "В выборе остался конфликт, который не подтверждён текущими источниками.");
    if (left && right && await fingerprint(definition.metadata(left)) !== await fingerprint(definition.metadata(right))) return reject("different-metadata", "Служебные поля, счётчики, версия формата или сведения недель различаются. Их объединение не определено; приоритет источнику не назначен.");
    if (!matchesLeft && !matchesRight) return reject("no-complete-source", "Ни один полный источник не содержит все выбранные записи и записи только из другого источника. Частичный или смешанный документ не создавался.");
    if (matchesLeft && matchesRight && await fingerprint(left!) !== await fingerprint(right!)) return reject("ambiguous-source", "Выбор карточек не определяет единственную полную версию документа. Порядок массивов и служебные данные не выбирались автоматически.");
    const document = matchesRight ? right! : left!;
    const revision = (document as { revision: number }).revision;
    if ([left, right].some(source => source && (source as { revision: number }).revision > revision)) return reject("no-complete-source", "Полная версия, соответствующая выбору, понижает ревизию другого источника. Перенос не подтверждён.");
    checkBackupAbort(signal); review.status = "matched"; review.source = matchesLeft && matchesRight ? "both" : matchesRight ? "browser" : "archive";
    return { review, document };
  } catch (error) {
    checkBackupAbort(signal);
    console.error("Не удалось проверить полный базовый источник резервной копии:", error);
    if (error instanceof BackupRecordDecodeError && error.reason === "missing-history") return reject("invalid-source", "В источнике есть ответ без сохранённой истории попыток. Полнота и счётчик не подтверждены; история из карточки или другого источника не создавалась.");
    return reject("invalid-source", "Базовый источник повреждён, неоднозначен, имеет неподдерживаемую схему или превышает предел проверки. Другой источник не подставлялся.");
  }
}
