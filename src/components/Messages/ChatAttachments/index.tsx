import { useId, useMemo, useRef, useState } from "react";
import type { StoredMessage } from "../../../data/messageStore";
import { downloadBlob } from "../../../domain/fileDownload";
import { getFilePreviewFormat } from "../../../domain/files";
import { messageDayLabel } from "../../../domain/messaging";
import { matchesSearchText } from "../../../domain/search";
import useMessageAttachment from "../../../hooks/useMessageAttachment";
import Modal from "../../Modal";
import FilePreview from "../../FilePreview";
import MessageFileCard from "../MessageFileCard";
import MessageActionIcon from "../MessageActionIcon";
import styles from "./index.module.scss";

interface Props { messages: StoredMessage[]; scope: string; name: string; onClose(): void; onLocate(id: number): void }
export default function ChatAttachments({ messages, scope, name, onClose, onLocate }: Props) {
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "image" | "file">("all");
  const files = useMemo(() => messages.slice().reverse().flatMap((message) => (message.attachments ?? []).map((file) => ({ file, message, image: getFilePreviewFormat(file)?.kind === "image" }))), [messages]);
  const visible = files.filter((entry) => (kind === "all" || (kind === "image" ? entry.image : !entry.image)) && matchesSearchText(entry.file.name, query));
  const attachment = useMessageAttachment(scope);
  return <Modal labelledBy={headingId} initialFocusRef={inputRef} onClose={onClose} className={styles.dialog}>
    <header className={styles.header}><span className={styles.symbol}><MessageActionIcon name="folder" /></span><div><h2 id={headingId}>Вложения</h2><p>{name}</p></div><button type="button" onClick={onClose} aria-label="Закрыть вложения"><MessageActionIcon name="close" /></button></header>
    <label className={styles.search}><MessageActionIcon name="search" /><input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти файл по названию" aria-label="Поиск вложений" />{query && <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Очистить поиск"><MessageActionIcon name="close" /></button>}</label>
    <div className={styles.filters} role="group" aria-label="Тип вложения">{([{ value: "all", label: "Все", count: files.length }, { value: "image", label: "Изображения", count: files.filter((entry) => entry.image).length }, { value: "file", label: "Документы", count: files.filter((entry) => !entry.image).length }] as const).map((item) => <button key={item.value} type="button" aria-pressed={kind === item.value} onClick={() => setKind(item.value)}>{item.label}<span>{item.count}</span></button>)}</div>
    {attachment.error && <div className={styles.error} role="alert">{attachment.error}<button type="button" onClick={attachment.clearError} aria-label="Скрыть ошибку"><MessageActionIcon name="close" /></button></div>}
    <div className={styles.list}>{visible.map(({ file, message }) => <article key={`${message.id}:${file.id}`}><MessageFileCard file={file} opening={attachment.opening} query={query} onOpen={(download) => { void attachment.open(file, download); }} /><footer><span>{message.incoming ? "Входящее" : "От вас"} · {messageDayLabel(message)}</span><button type="button" onClick={() => onLocate(message.id)}>В переписке<MessageActionIcon name="next" /></button></footer></article>)}{!visible.length && <div className={styles.empty}><MessageActionIcon name="folder" /><strong>{files.length ? "Ничего не найдено" : "Здесь будут файлы из переписки"}</strong><p>{files.length ? "Попробуйте другое название или тип вложения." : "Изображения и документы появятся здесь после отправки в этот чат."}</p>{files.length > 0 && <button type="button" onClick={() => { setQuery(""); setKind("all"); }}>Сбросить фильтры</button>}</div>}</div>
    <p className={styles.note}>От новых к старым · файлы доступны только в этом браузере</p>
    {attachment.preview && <FilePreview name={attachment.preview.name} blob={attachment.preview.blob} onDownload={() => downloadBlob(attachment.preview!.blob, attachment.preview!.name)} onClose={attachment.closePreview} />}
  </Modal>;
}
