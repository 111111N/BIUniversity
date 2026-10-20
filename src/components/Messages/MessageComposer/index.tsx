import { useCallback, useLayoutEffect, useRef, type FormEvent, type RefObject } from "react";
import type { StoredMessage } from "../../../data/messageStore";
import { formatFileSize } from "../../../domain/files";
import MessageActionIcon from "../MessageActionIcon";
import styles from "./index.module.scss";

interface Props {
  id: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  name: string;
  text: string;
  textSaved: boolean;
  newGroup: boolean;
  files: File[];
  replyId?: number;
  reply?: StoredMessage;
  sending: boolean;
  readOnly: boolean;
  onSubmit(event: FormEvent): void;
  onText(text: string): void;
  onFiles(files: FileList): void;
  onRemoveFile(index: number): void;
  onCancelReply(): void;
}

export default function MessageComposer({ id, inputRef, name, text, textSaved, newGroup, files, replyId, reply, sending, readOnly, onSubmit, onText, onFiles, onRemoveFile, onCancelReply }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fit = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${Math.max(42, Math.min(150, input.scrollHeight))}px`;
  }, [inputRef]);
  useLayoutEffect(fit, [text, fit]);
  useLayoutEffect(() => { window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit); }, [fit]);
  return <form className={styles.composer} onSubmit={onSubmit}>
    <div className={styles.inputShell}>
    {replyId !== undefined && <div className={styles.replyDraft}><MessageActionIcon name="reply" /><div><strong>{reply ? reply.incoming ? "Ответ собеседнику" : "Ответ на своё сообщение" : "Сообщение удалено"}</strong><span>{reply ? reply.text.slice(0, 180) || reply.attachments?.[0]?.name : "Уберите цитату, чтобы отправить сообщение"}</span></div><button type="button" disabled={sending} onClick={onCancelReply} aria-label="Отменить ответ"><MessageActionIcon name="close" /></button></div>}
    {files.length > 0 && <ul className={styles.draftFiles}>{files.map((file, index) => <li key={`${file.name}-${index}`}><MessageActionIcon name="attach" /><span><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></span><button type="button" disabled={sending} onClick={() => onRemoveFile(index)} aria-label={`Убрать файл ${file.name}`}><MessageActionIcon name="close" /></button></li>)}</ul>}
    <div className={styles.composeRow}><input ref={fileInputRef} type="file" multiple hidden onChange={(event) => { if (event.target.files) onFiles(event.target.files); event.target.value = ""; }} /><button type="button" className={styles.attachButton} disabled={sending || readOnly || files.length >= 5} onClick={() => fileInputRef.current?.click()} aria-label="Прикрепить файлы" title="До 5 файлов, каждый до 25 МБ"><MessageActionIcon name="attach" /></button>
    <label className={styles.srOnly} htmlFor={id}>Сообщение для {name}</label><textarea id={id} ref={inputRef} rows={1} value={text} maxLength={16000} disabled={sending} onPaste={(event) => { if (event.clipboardData.files.length && !readOnly) { event.preventDefault(); onFiles(event.clipboardData.files); } }} onChange={(event) => onText(event.target.value)} placeholder="Написать сообщение…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
    <button type="submit" className={styles.sendButton} disabled={(!text.trim() && !files.length) || readOnly || sending || (replyId !== undefined && !reply)} aria-label={sending ? "Сохраняем сообщение" : "Отправить сообщение"} title={replyId !== undefined && !reply ? "Уберите недоступную цитату перед отправкой" : "Отправить · Enter"}><MessageActionIcon name="send" /></button></div>
    </div>
    <div className={styles.hint}><span>Enter — отправить <i>·</i> Shift + Enter — новая строка</span><span role="status" title={newGroup ? "Новая беседа появится в списке после первого сообщения. До этого текст, состав и название беседы остаются только в памяти — не уходите из раздела. Файлы и цитаты ответа также не восстанавливаются после выхода." : "В рамках этой вкладки сохраняется только текстовый черновик. После ухода из раздела файлы нужно прикрепить заново, а цитату ответа — выбрать повторно. История локальная, доставка собеседнику пока не подключена."}>{sending ? "Сохраняем…" : newGroup ? "Новая беседа · до выхода" : text ? textSaved ? "Текст сохранён в этой вкладке" : "Текст только в памяти" : files.length ? "Вложения до выхода" : "Локальный режим"}{!sending && text ? files.length > 0 && replyId !== undefined ? " · файлы и цитата до выхода" : files.length > 0 ? " · файлы до выхода" : replyId !== undefined ? " · цитата до выхода" : "" : ""}</span></div>
  </form>;
}
