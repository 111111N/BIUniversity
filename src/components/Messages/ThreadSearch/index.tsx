import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import MessageActionIcon from "../MessageActionIcon";
import styles from "./index.module.scss";

interface Props { query: string; onQuery(value: string): void; onlyFiles: boolean; onOnlyFiles(): void; count: number; position: number; onMove(offset: number): void; onClose(): void }
export default function ThreadSearch({ query, onQuery, onlyFiles, onOnlyFiles, count, position, onMove, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);
  const handleEscape = (event: KeyboardEvent<HTMLElement>) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } };
  return <div className={styles.search} role="search" aria-label="Поиск в переписке">
    <label><MessageActionIcon name="search" /><input ref={inputRef} type="search" value={query} placeholder="Найти сообщение или файл" aria-label="Текст или название файла" title="Enter — предыдущее совпадение, Shift + Enter — следующее" onChange={(event) => onQuery(event.target.value)} onKeyDown={(event) => { handleEscape(event); if (event.key === "Enter") { event.preventDefault(); onMove(event.shiftKey ? 1 : -1); } }} /></label>
    <div className={styles.controls}><button type="button" className={styles.filesFilter} aria-pressed={onlyFiles} onClick={onOnlyFiles} onKeyDown={handleEscape}><MessageActionIcon name="attach" />С файлами</button><span role="status" aria-live="polite">{count ? `${position + 1} из ${count}` : query.trim() || onlyFiles ? "Не найдено" : "Поиск по истории"}</span><button type="button" disabled={!count} onClick={() => onMove(-1)} onKeyDown={handleEscape} aria-label="Предыдущее совпадение"><MessageActionIcon name="up" /></button><button type="button" disabled={!count} onClick={() => onMove(1)} onKeyDown={handleEscape} aria-label="Следующее совпадение"><MessageActionIcon name="down" /></button><button type="button" onClick={onClose} onKeyDown={handleEscape} aria-label="Закрыть поиск"><MessageActionIcon name="close" /></button></div>
  </div>;
}
