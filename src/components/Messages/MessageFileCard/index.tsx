import type { MessageAttachment } from "../../../data/messageStore";
import { formatFileSize, getFilePreviewFormat } from "../../../domain/files";
import MessageActionIcon from "../MessageActionIcon";
import MessageText from "../MessageText";
import styles from "./index.module.scss";

interface Props { file: MessageAttachment; opening: string | null; query?: string; onOpen(download?: boolean): void }
export default function MessageFileCard({ file, opening, query = "", onOpen }: Props) {
  const format = getFilePreviewFormat(file);
  const extension = file.name.includes(".") ? file.name.split(".").at(-1)?.slice(0, 5).toUpperCase() : "ФАЙЛ";
  return <div className={styles.file}>
    <button type="button" className={styles.open} disabled={Boolean(opening)} onClick={() => onOpen()} aria-label={`${format ? "Открыть" : "Скачать"} ${file.name}`}><span className={`${styles.icon} ${format?.kind === "image" ? styles.image : ""}`}>{extension || "ФАЙЛ"}</span><span className={styles.identity}><strong><MessageText text={file.name} query={query} linkify={false} /></strong><small>{opening === file.id ? "Открываем…" : `${formatFileSize(file.size)} · ${format ? "Просмотр" : "Скачивание"}`}</small></span></button>
    <button type="button" className={styles.download} disabled={Boolean(opening)} onClick={() => onOpen(true)} aria-label={`Скачать ${file.name}`} title="Скачать"><MessageActionIcon name="download" /></button>
  </div>;
}
