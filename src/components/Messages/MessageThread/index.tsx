import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MessageAttachment, StoredMessage } from "../../../data/messageStore";
import { downloadBlob } from "../../../domain/fileDownload";
import { matchesSearchText } from "../../../domain/search";
import { messageDayKey, messageDayLabel } from "../../../domain/messaging";
import useMessageAttachment from "../../../hooks/useMessageAttachment";
import Checkbox from "../../Checkbox";
import FilePreview from "../../FilePreview";
import MessageActionIcon from "../MessageActionIcon";
import MessageActionsMenu from "../MessageActionsMenu";
import MessageText from "../MessageText";
import ThreadSearch from "../ThreadSearch";
import ChatAttachments from "../ChatAttachments";
import MessageFileCard from "../MessageFileCard";
import MessageToast from "../MessageToast";
import styles from "./index.module.scss";

export interface ThreadPosition { top: number; followLatest: boolean }
interface Props { messages: StoredMessage[]; contactName: string; positions: Map<string, ThreadPosition>; positionKey: string; searchOpen: boolean; onSearchClose(): void; filesOpen: boolean; onFilesClose(): void; group: boolean; scrollRequest: number; attachmentScope: string; onDelete(messages: StoredMessage[]): void; onReply(message: StoredMessage): void; readOnly?: boolean }

const MessageThread = ({ messages, contactName, positions, positionKey, searchOpen, onSearchClose, filesOpen, onFilesClose, group, scrollRequest, attachmentScope, onDelete, onReply, readOnly = false }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const initialPosition = useRef(positions.get(positionKey));
  const initialized = useRef(false);
  const followLatest = useRef(initialPosition.current?.followLatest ?? true);
  const previousLength = useRef(0);
  const previousRequest = useRef(scrollRequest);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [query, setQuery] = useState("");
  const [onlyFiles, setOnlyFiles] = useState(false);
  const [searchId, setSearchId] = useState<number | null>(null);
  const searchIdRef = useRef(searchId);
  searchIdRef.current = searchId;
  const searchCriteria = useRef("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [jumpBack, setJumpBack] = useState<{ top: number; originId?: number } | null>(null);
  const [locatedId, setLocatedId] = useState<number | null>(null);
  const selectionAnchor = useRef<number | null>(null);
  const attachment = useMessageAttachment(attachmentScope);
  const { opening, preview } = attachment;
  const [menu, setMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const menuMessage = messages.find((message) => message.id === menu?.id);
  const messageRefs = useRef(new Map<number, HTMLDivElement>());
  useEffect(() => {
    const available = new Set(messages.map((message) => message.id));
    const remaining = selectedIds.filter((id) => available.has(id));
    if (remaining.length !== selectedIds.length) {
      setSelectedIds(remaining);
      if (!remaining.length) setSelectionMode(false);
    }
    if (selectionAnchor.current !== null && !available.has(selectionAnchor.current)) selectionAnchor.current = null;
    if (menu && !available.has(menu.id)) setMenu(null);
  }, [messages, selectedIds, menu]);
  const selected = messages.filter((message) => selectedIds.includes(message.id));
  const ownSelected = selected.filter((message) => !message.incoming);
  const clearSelection = () => { setSelectedIds([]); setSelectionMode(false); selectionAnchor.current = null; };
  const toggleSelection = (id: number, range = false) => {
    const anchor = messages.findIndex((message) => message.id === selectionAnchor.current);
    const target = messages.findIndex((message) => message.id === id);
    if (range && anchor >= 0 && target >= 0) setSelectedIds((ids) => [...new Set([...ids, ...messages.slice(Math.min(anchor, target), Math.max(anchor, target) + 1).map((message) => message.id)])]);
    else { setSelectedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]); selectionAnchor.current = id; }
  };
  const goToMessage = useCallback((id: number, focus = true) => {
    const node = messageRefs.current.get(id), viewport = scrollRef.current;
    if (!node || !viewport) return;
    followLatest.current = false;
    const offset = node.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
    viewport.scrollTop = Math.max(0, offset - Math.max(0, (viewport.clientHeight - node.offsetHeight) / 2));
    if (focus) { node.focus({ preventScroll: true }); setLocatedId(id); }
  }, []);
  const locateMessage = (id: number, originId?: number) => {
    if (!messageRefs.current.has(id)) return;
    setJumpBack((previous) => previous ?? { top: scrollRef.current?.scrollTop ?? 0, originId });
    goToMessage(id);
  };
  const returnToReading = () => {
    const viewport = scrollRef.current;
    if (!viewport || !jumpBack) return;
    viewport.scrollTop = jumpBack.top;
    const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 48;
    followLatest.current = nearBottom;
    positions.set(positionKey, { top: viewport.scrollTop, followLatest: nearBottom });
    setAtBottom(nearBottom);
    if (jumpBack.originId !== undefined) messageRefs.current.get(jumpBack.originId)?.focus({ preventScroll: true });
    setJumpBack(null); setLocatedId(null);
  };
  useEffect(() => { if (locatedId === null) return; const timer = window.setTimeout(() => setLocatedId(null), 1800); return () => window.clearTimeout(timer); }, [locatedId]);
  const searchMatches = useMemo(() => !searchOpen || (!query.trim() && !onlyFiles) ? [] : messages.filter((message) => (!onlyFiles || Boolean(message.attachments?.length)) && matchesSearchText([message.text, ...(message.attachments ?? []).map((file) => file.name)].join(" "), query)), [messages, searchOpen, query, onlyFiles]);
  const searchPosition = searchMatches.findIndex((message) => message.id === searchId);
  const moveSearch = (offset: number) => {
    if (!searchMatches.length) return;
    const index = (Math.max(0, searchPosition) + offset + searchMatches.length) % searchMatches.length;
    setSearchId(searchMatches[index].id); goToMessage(searchMatches[index].id, false);
  };
  useLayoutEffect(() => {
    const criteria = JSON.stringify([searchOpen, query, onlyFiles]);
    const previous = criteria === searchCriteria.current ? searchMatches.find((message) => message.id === searchIdRef.current) : undefined;
    const target = previous ?? searchMatches.at(-1);
    setSearchId(target?.id ?? null);
    if (target && !previous) goToMessage(target.id, false);
    searchCriteria.current = criteria;
  }, [searchMatches, goToMessage, searchOpen, query, onlyFiles]);
  const copy = async (items: StoredMessage[]) => {
    const text = items.map((message) => [message.text, ...(message.attachments ?? []).map((file) => `📎 ${file.name}`)].filter(Boolean).join("\n")).join("\n\n");
    attachment.clearError();
    try { await navigator.clipboard.writeText(text); setNotice({ text: items.length > 1 ? `Скопировано сообщений: ${items.length}` : "Сообщение скопировано" }); }
    catch { setNotice({ text: "Браузер не разрешил копирование. Можно выделить текст сообщения и нажать Ctrl / ⌘ + C.", error: true }); }
  };
  const openAttachment = (file: MessageAttachment, download = false) => { setNotice(null); void attachment.open(file, download); };

  const scrollToLatest = useCallback(() => {
    followLatest.current = true;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      positions.set(positionKey, { top: scrollRef.current.scrollTop, followLatest: true });
    }
    setAtBottom(true);
    setNewCount(0);
  }, [positions, positionKey]);

  useLayoutEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      if (initialPosition.current && !initialPosition.current.followLatest && scrollRef.current) {
        scrollRef.current.scrollTop = initialPosition.current.top;
        const nearBottom = scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight < 48;
        followLatest.current = nearBottom;
        setAtBottom(nearBottom);
      } else scrollToLatest();
    }
    else if (followLatest.current || scrollRequest !== previousRequest.current) scrollToLatest();
    else if (messages.length > previousLength.current) {
      const added = messages.length - previousLength.current;
      setNewCount((count) => count + added);
    }
    else if (messages.length < previousLength.current) setNewCount(0);
    previousLength.current = messages.length;
    previousRequest.current = scrollRequest;
  }, [messages, scrollRequest, scrollToLatest]);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (followLatest.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
    if (scrollRef.current) observer.observe(scrollRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  return <div className={styles.frame} onKeyDown={(event) => {
    if (event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
    if (event.key === "Escape" && selectionMode) { event.preventDefault(); clearSelection(); }
    const editing = Boolean((event.target as HTMLElement).closest("input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true]"));
    if (!selectionMode || editing) return;
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "a" || event.code === "KeyA")) { event.preventDefault(); setSelectedIds(messages.map((message) => message.id)); }
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "c" || event.code === "KeyC") && selected.length && !window.getSelection()?.toString()) { event.preventDefault(); void copy(selected); }
    if (event.key === "Delete" && ownSelected.length && !readOnly) { event.preventDefault(); onDelete(ownSelected); }
  }}>
    {searchOpen && <ThreadSearch query={query} onQuery={setQuery} onlyFiles={onlyFiles} onOnlyFiles={() => setOnlyFiles((value) => !value)} count={searchMatches.length} position={Math.max(0, searchPosition)} onMove={moveSearch} onClose={() => { setQuery(""); setOnlyFiles(false); onSearchClose(); scrollRef.current?.focus({ preventScroll: true }); }} />}
    {selectionMode && <div className={styles.selectionBar} role="toolbar" aria-label="Действия с выбранными сообщениями"><strong>Выбрано: {selected.length}</strong><button type="button" onClick={() => setSelectedIds(selected.length === messages.length ? [] : messages.map((message) => message.id))}>{selected.length === messages.length ? "Снять выбор" : "Выбрать все"}</button><button type="button" disabled={!selected.length} onClick={() => { void copy(selected); }}><MessageActionIcon name="copy" />Копировать</button><button type="button" disabled={!ownSelected.length || readOnly} onClick={() => onDelete(ownSelected)}><MessageActionIcon name="delete" />Удалить свои{ownSelected.length > 0 ? ` (${ownSelected.length})` : ""}</button><button type="button" onClick={clearSelection} aria-label="Завершить выбор"><MessageActionIcon name="close" /></button><small>Shift + клик — диапазон · Ctrl/⌘ + A — все · удаляются только ваши сообщения.</small></div>}
    {(attachment.error || notice) && <MessageToast text={attachment.error || notice!.text} error={Boolean(attachment.error || notice?.error)} onClose={() => { setNotice(null); attachment.clearError(); }} />}
    <div ref={scrollRef} className={styles.thread} tabIndex={0} role="region" aria-label="История сообщений" onScroll={(event) => {
      const element = event.currentTarget;
      const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
      followLatest.current = nearBottom;
      positions.set(positionKey, { top: element.scrollTop, followLatest: nearBottom });
      setAtBottom(nearBottom);
      if (nearBottom) setNewCount(0);
    }}>
      <div ref={contentRef} className={`${styles.messages} ${selectionMode ? styles.selecting : ""}`}>
        {messages.length ? messages.map((message, index) => {
          const previous = messages[index - 1];
          const newDay = !previous || messageDayKey(previous) !== messageDayKey(message);
          const joined = !newDay && previous.incoming === message.incoming && (!group || !message.incoming) && Boolean(previous.sentAt && message.sentAt && Math.abs(Date.parse(message.sentAt) - Date.parse(previous.sentAt)) < 5 * 60_000);
          const original = message.replyTo === undefined ? undefined : messages.find((item) => item.id === message.replyTo);
          const summary = message.text || message.attachments?.[0]?.name || "Сообщение";
          return <Fragment key={message.id}>{newDay && <div className={styles.dayDivider}><span>{messageDayLabel(message)}</span></div>}<div ref={(node) => { if (node) messageRefs.current.set(message.id, node); else messageRefs.current.delete(message.id); }} tabIndex={-1} className={`${message.incoming ? styles.incoming : styles.outgoing} ${joined ? styles.joined : ""} ${selectedIds.includes(message.id) ? styles.selectedMessage : ""} ${searchOpen && searchId === message.id ? styles.searchResult : ""} ${locatedId === message.id ? styles.located : ""}`} onClick={(event) => {
            if ((event.target as HTMLElement).closest("button, a, input, label") || (!selectionMode && !event.shiftKey && window.getSelection()?.toString())) return;
            if (selectionMode || event.ctrlKey || event.metaKey || event.shiftKey) { setSelectionMode(true); toggleSelection(message.id, event.shiftKey); }
            else setMenu({ id: message.id, x: event.clientX, y: event.clientY });
          }} onContextMenu={(event) => { if (window.getSelection()?.toString()) return; event.preventDefault(); setMenu({ id: message.id, x: event.clientX, y: event.clientY }); }}>
            {selectionMode && <Checkbox checked={selectedIds.includes(message.id)} onChange={() => toggleSelection(message.id)} label={<span className={styles.srOnly}>{`Выбрать: ${summary.slice(0, 60)}`}</span>} />}
            <span className={styles.srOnly}>{message.incoming ? "Входящее сообщение" : "Ваше сообщение"}</span>
            {group && message.incoming && <span className={styles.sender}>Участник беседы</span>}
            {message.replyTo !== undefined && <button type="button" className={styles.quote} disabled={!original} onClick={() => locateMessage(message.replyTo!, message.id)}><strong>{original ? original.incoming ? group ? "Участник беседы" : contactName : "Вы" : "Сообщение удалено"}</strong><span>{original ? original.text.slice(0, 180) || original.attachments?.[0]?.name : "Цитата больше недоступна"}</span></button>}
            {message.text && <p><MessageText text={message.text} query={searchOpen ? query : ""} /></p>}
            {Boolean(message.attachments?.length) && <div className={styles.attachments}>{message.attachments!.map((file) => <MessageFileCard key={file.id} file={file} opening={opening} query={searchOpen ? query : ""} onOpen={(download) => openAttachment(file, download)} />)}</div>}
            <div className={styles.messageMeta}><time dateTime={message.sentAt} title={message.sentAt ? new Date(message.sentAt).toLocaleString("ru-RU") : "Время из сохранённой переписки; дата неизвестна"}>{message.time}</time><div className={styles.messageActions}><button type="button" aria-haspopup="menu" aria-expanded={menu?.id === message.id} onClick={(event) => { const box = event.currentTarget.getBoundingClientRect(); setMenu({ id: message.id, x: box.right - 196, y: box.bottom + 4 }); }} aria-label="Действия с сообщением" title="Действия с сообщением">•••</button></div></div>
          </div></Fragment>;
        }) : <div className={styles.empty}><strong>Начните общение</strong><span>{group ? "Подготовьте первое сообщение для участников беседы." : "Выбран только собеседник. Диалог появится в списке после отправки сообщения."}</span></div>}
      </div>
    </div>
    <div className={styles.threadNav}>{jumpBack && <button type="button" className={styles.returnButton} onClick={returnToReading} title="Вернуться к месту чтения"><MessageActionIcon name="back" />{jumpBack.originId !== undefined ? "К ответу" : "Назад"}</button>}{!atBottom && messages.length > 0 && <button type="button" className={styles.latest} onClick={() => { setJumpBack(null); scrollToLatest(); }}>К последним{newCount > 0 && <b>{newCount} новых</b>}<MessageActionIcon name="down" /></button>}</div>
    <p className={styles.srOnly} role="status">{newCount > 0 ? `Новых сообщений: ${newCount}. Можно перейти к последним сообщениям кнопкой под историей.` : ""}</p>
    {preview && <FilePreview name={preview.name} blob={preview.blob} onDownload={() => downloadBlob(preview.blob, preview.name)} onClose={attachment.closePreview} />}
    {filesOpen && <ChatAttachments messages={messages} scope={attachmentScope} name={contactName} onClose={onFilesClose} onLocate={(id) => { onFilesClose(); requestAnimationFrame(() => locateMessage(id)); }} />}
    {menu && menuMessage && <MessageActionsMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} returnFocus={() => messageRefs.current.get(menu.id)?.focus({ preventScroll: true })} actions={[
      { id: "reply", label: "Ответить", disabled: readOnly, run: () => onReply(menuMessage) },
      { id: "copy", label: "Копировать", run: () => { void copy([menuMessage]); } },
      { id: "select", label: "Выбрать", run: () => { setSelectionMode(true); selectionAnchor.current = menuMessage.id; setSelectedIds((ids) => ids.includes(menuMessage.id) ? ids : [...ids, menuMessage.id]); } },
      ...(!menuMessage.incoming ? [{ id: "delete" as const, label: "Удалить", disabled: readOnly, run: () => onDelete([menuMessage]) }] : []),
    ]} />}
  </div>;
};

export default MessageThread;
