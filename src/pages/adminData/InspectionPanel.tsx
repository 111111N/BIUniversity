import { useState } from "react";
import type { BackupInspection, BackupDifferenceKind } from "../../data/localBackupInspectionService";
import styles from "./index.module.scss";
import DocumentReview from "./DocumentReview";

export interface InspectionPanelProps {
  file: File | null; busy: boolean; progress: string; error: string; result: BackupInspection | null; unavailable: boolean;
  onFile(file: File | null): void; onInspect(): void; onCancel(): void;
}
const labels: Record<BackupDifferenceKind, string> = { new: "Только в архиве", different: "Содержимое отличается", "current-only": "Только в браузере", schema: "Различие структуры" };
const when = (value: string) => new Date(value).toLocaleString("ru-RU");

export default function InspectionPanel({ file, busy, progress, error, result, unavailable, onFile, onInspect, onCancel }: InspectionPanelProps) {
  const [page, setPage] = useState(1);
  const differences = result?.comparison.differences ?? [];
  const pages = Math.max(1, Math.ceil(differences.length / 20)); const currentPage = Math.min(page, pages);
  return <section className={styles.card} aria-labelledby="inspection-title">
    <h1 id="inspection-title" className={styles.title}>Проверить резервную копию</h1>
    <p className={styles.intro}>Выберите ранее скачанный JSON. Файл проверяется на этом устройстве, без отправки на сервер. Данные портала не изменяются.</p>
    <label className={styles.fileLabel} htmlFor="backup-file">Файл резервной копии · до 128 МиБ</label>
    <input id="backup-file" className={styles.fileInput} type="file" accept=".json,application/json" disabled={busy || unavailable} onChange={(event) => { setPage(1); onFile(event.target.files?.[0] ?? null); }} aria-describedby="backup-inspect-hint" />
    {file && <p className={styles.filename}>Выбран: {file.name}</p>}
    <p id="backup-inspect-hint" className={styles.hint}>Восстановление пока недоступно. Сравнение показывает различия на момент проверки; оно не выбирает записи для перезаписи или удаления.</p>
    <div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={!file || busy || unavailable} onClick={onInspect}>{busy ? "Проверяем…" : "Проверить файл"}</button>
      {busy && <button type="button" onClick={onCancel}>Отменить</button>}
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" className={styles.status}>{busy ? progress : result ? `Проверка завершена. Ошибки в документах: ${result.documents.counts.errors}. Требуют проверки: ${result.documents.counts.reviews}. Сравнение с браузером готово.` : ""}</p>
    {unavailable && <p className={styles.error} role="alert">Проверка доступна только действующему настройщику.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {result && <div className={styles.inspection}>
      <DocumentReview key={`${result.sha256}:${result.inspectedAt}`} review={result.documents} />
      <div className={styles.reportHeading}><h2>Сравнение с этим браузером</h2><p>{result.filename} · архив от {when(result.completedAt)}</p></div>
      <dl className={styles.statistics}>
        <div><dt>Совпадают</dt><dd>{result.comparison.same}</dd></div>
        <div><dt>Только в архиве</dt><dd>{result.comparison.new}</dd></div>
        <div><dt>Отличаются</dt><dd>{result.comparison.different}</dd></div>
        <div><dt>Только в браузере</dt><dd>{result.comparison.currentOnly}</dd></div>
        <div><dt>Различия структуры</dt><dd>{result.comparison.schema}</dd></div>
      </dl>
      <p className={styles.hint}>Подсчитаны сохранённые локальные записи и файловые записи по ID, а не студенты или дисциплины внутри документов. Совпадение ID с другим содержимым отмечено как различие. Записи только в браузере сохраняются: этот просмотр ничего не удаляет.</p>
      <div className={styles.notice}><strong>Это предпросмотр, данные не восстановлены.</strong><p>Общий моментальный снимок разных хранилищ не гарантирован. Проверки учебных связей пока частичные; для восстановления ещё нужны проверки прав, владельцев файлов и совместимости всех документов.</p></div>
      {differences.length ? <>
        <ul className={styles.differences} aria-label="Различия с текущими данными">{differences.slice((currentPage - 1) * 20, currentPage * 20).map((item) => <li key={`${item.area}:${item.id}:${item.kind}`}><div><strong>{labels[item.kind]}</strong><span>{item.area}</span></div><code>{item.id}</code></li>)}</ul>
        <div className={styles.pagination}><span>Страница {currentPage} из {pages} · различий {differences.length}</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</button><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Далее</button></div></div>
      </> : <p className={styles.hint}>Различий в проверенных сохранённых записях и структуре хранилищ не найдено.</p>}
      <details className={styles.details}><summary>Что проверено и какие есть ограничения</summary><div>
        {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        <p>Источник: {result.source.origin}{result.source.basePath}. Сравнение выполнено {when(result.inspectedAt)}. Если данные изменились после проверки, результат нужно получить заново.</p>
        <p>В архиве: локальных записей — {result.totals.storageEntries}, файловых записей — {result.totals.databaseRecords}, вложений — {result.totals.files}.</p>
        <p className={styles.filename}>SHA-256 файла: {result.sha256}</p>
      </div></details>
    </div>}
  </section>;
}
