import { useId, useRef } from "react";
import Modal from "../../components/Modal";
import type { BackupDifference } from "../../domain/backupComparison";
import { getBackupDifferenceKeyLabel } from "../../domain/backupComparison";
import type { BackupRecordPreview } from "../../domain/backupRecordPreview";
import type { BackupConflictVersion } from "../../data/localBackupConflictPreviewService";
import styles from "./index.module.scss";

interface Props { difference: BackupDifference; preview: BackupRecordPreview | null; error: string; choice?: BackupConflictVersion; onChoose?(version: BackupConflictVersion): void; onClose(): void }
export default function ConflictPreviewDialog({ difference, preview, error, choice, onChoose, onClose }: Props) {
  const id = useId(), close = useRef<HTMLButtonElement>(null);
  return <Modal labelledBy={id} initialFocusRef={close} onClose={onClose} className={styles.conflictDialog}>
    <header className={styles.conflictHeader}><h2 id={id}>Сравнение версий</h2><button ref={close} type="button" aria-label="Закрыть сравнение версий" onClick={onClose}>×</button></header>
    <p className={styles.hint}>{preview?.collectionLabel ?? difference.area}</p><code className={styles.conflictId}>{difference.id}</code>
    {getBackupDifferenceKeyLabel(difference) && <p className={styles.hint}>{getBackupDifferenceKeyLabel(difference)}</p>}
    {!preview && !error && <p role="status" aria-live="polite">Проверяем доступ и актуальность версий…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {preview && !error && <>
      <p className={styles.hint}>Показаны изменённые поля. Выбор остаётся черновиком этой проверки; данные не перезаписываются и восстановление не запускается.</p>
      <div className={styles.conflictRows}>{preview.rows.map(row => <section className={styles.conflictRow} key={row.field} aria-labelledby={`${id}-${row.field}`}><h3 id={`${id}-${row.field}`}>{row.label}</h3><dl><div><dt>Архив</dt><dd><pre>{row.archive}</pre></dd></div><div><dt>Этот браузер</dt><dd><pre>{row.browser}</pre></dd></div></dl></section>)}</div>
      {preview.hasUnpreviewedFields && <p className={styles.hint} role="status">Различаются также дополнительные поля без поддерживаемой схемы. Их содержимое не показано; это сравнение не охватывает их значения.</p>}
      {onChoose && <div className={styles.conflictChoices} role="group" aria-label="Версия записи в черновике"><button type="button" disabled={preview.hasUnpreviewedFields || !preview.rows.length} aria-pressed={choice === "archive"} onClick={() => onChoose("archive")}>Выбрать из архива</button><button type="button" disabled={preview.hasUnpreviewedFields || !preview.rows.length} aria-pressed={choice === "browser"} onClick={() => onChoose("browser")}>Выбрать из браузера</button></div>}
      {choice && <p className={styles.hint} role="status">В черновике выбрана версия: {choice === "archive" ? "архив" : "этот браузер"}. Связи и возможность восстановления ещё требуют проверки.</p>}
    </>}
    <footer className={styles.conflictActions}><button type="button" onClick={onClose}>Закрыть</button></footer>
  </Modal>;
}
