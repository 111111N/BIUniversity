import type { StoredMaterial } from "../../../data/materialRepository";
import { formatFileSize, getFilePreviewFormat } from "../../../domain/files";
import DownloadButton from "../../DownloadButton";
import styles from "./index.module.scss";

interface Props {
  file: StoredMaterial;
  readOnly: boolean;
  busy: boolean;
  pinning: boolean;
  onDownload(): void | Promise<void>;
  onPreview(): void;
  onPin(): void;
  onDelete(): void;
}

const MaterialCard = ({ file, readOnly, busy, pinning, onDownload, onPreview, onPin, onDelete }: Props) => {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.slice(0, 6) : "Файл";
  const date = new Date(file.createdAt);
  const hasDate = Number.isFinite(date.getTime());
  const canPreview = file.blob instanceof Blob && Boolean(getFilePreviewFormat({ name: file.name, type: file.blob.type }));
  return <article className={`${styles.card} ${file.pinned ? styles.pinned : ""}`}>
    <div className={styles.heading}>
      <span className={styles.fileType} aria-hidden="true">{extension || "Файл"}</span>
      <div className={styles.identity}><span className={styles.category}>{file.category ?? "Материал"}</span><h3 title={file.name}>{file.name}</h3></div>
    </div>
    {file.pinned && <span className={styles.pin}>Закреплено</span>}
    {file.description && <p className={styles.description}>{file.description}</p>}
    <dl className={styles.metadata}>
      <div><dt>Размер</dt><dd>{formatFileSize(file.size)}</dd></div>
      <div><dt>Добавлен</dt><dd>{hasDate ? <time dateTime={date.toISOString()}>{date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}</time> : "Дата не указана"}</dd></div>
    </dl>
    <p className={styles.author}>Добавил: <span>{file.uploadedBy ?? "Преподаватель"}</span></p>
    <div className={styles.actions}>
      {canPreview && <button type="button" className={styles.previewButton} onClick={onPreview} aria-label={`Просмотреть материал ${file.name}`}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z" /><circle cx="10" cy="10" r="2.5" /></svg>Просмотр</button>}
      <DownloadButton name={file.name} compact className={styles.download} onDownload={onDownload} />
      {!readOnly && <div className={styles.manage}><button type="button" disabled={busy} aria-pressed={Boolean(file.pinned)} onClick={onPin}>{pinning ? "Сохраняем…" : file.pinned ? "Открепить" : "Закрепить"}</button><button type="button" disabled={busy} className={styles.deleteButton} onClick={onDelete}>Удалить</button></div>}
    </div>
  </article>;
};

export default MaterialCard;
