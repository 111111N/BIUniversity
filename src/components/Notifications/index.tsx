import { useId, useMemo, useRef, useState } from "react";
import { type AppNotification, readNotificationState, saveNotifications } from "../../data/notificationStore";
import { useRole } from "../RoleContext";
import SearchField from "../SearchField";
import Dropdown from "../Dropdown";
import { matchesSearchText } from "../../domain/search";
import NotificationItem, { notificationKindLabels } from "./NotificationItem";
import { useNotificationItems } from "./useNotifications";
import styles from "./index.module.scss";

type NotificationFilter = "all" | "unread";
type NotificationDayGroup = { label: string; items: AppNotification[] };
const dayFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const yearDayFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const dayLabel = (date: Date, now: Date) => {
  if (dayKey(date) === dayKey(now)) return "Сегодня";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return "Вчера";
  return (date.getFullYear() === now.getFullYear() ? dayFormat : yearDayFormat).format(date);
};

interface Props { compact?: boolean; onNavigate?(): void }

const Notifications = ({ compact = false, onNavigate }: Props) => {
  const { currentUser } = useRole();
  const [items, setItems, readError, refreshItems] = useNotificationItems();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [kind, setKind] = useState<"all" | AppNotification["kind"]>("all");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const searchId = useId();
  const filtersRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const restoreFilterFocus = () => requestAnimationFrame(() => filtersRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true }));
  const userItems = useMemo(() => items.filter((item) => item.recipientUserId === currentUser.id).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)), [currentUser.id, items]);
  const unreadCount = userItems.filter((item) => !item.read).length;
  const visible = userItems.filter((item) => (filter !== "unread" || !item.read) && (kind === "all" || kind === item.kind) && matchesSearchText(`${item.title} ${item.body} ${notificationKindLabels[item.kind]}`, query));
  const searching = Boolean(query.trim() || kind !== "all");
  const now = new Date();
  const groups = new Map<string, NotificationDayGroup>();
  visible.forEach((item) => {
    const date = new Date(item.createdAt);
    const key = dayKey(date);
    const group: NotificationDayGroup = groups.get(key) ?? { label: dayLabel(date, now), items: [] };
    group.items.push(item);
    groups.set(key, group);
  });
  const resetFilters = () => { setQuery(""); setKind("all"); setFilter("all"); restoreFilterFocus(); };
  const toggleSearch = () => {
    if (searchOpen) setQuery("");
    else requestAnimationFrame(() => searchRef.current?.querySelector<HTMLInputElement>("input")?.focus());
    setSearchOpen((open) => !open);
  };

  const persist = (next: AppNotification[]) => {
    setError(""); setMessage("");
    try { saveNotifications(next); setItems(next); return true; }
    catch { refreshItems(); setError("Не удалось сохранить статус прочтения. Попробуйте ещё раз — уведомления не изменены."); return false; }
  };
  const markRead = (id: string) => {
    const snapshot = readNotificationState();
    if (snapshot.error) { refreshItems(); setError(snapshot.error); return false; }
    const latest = snapshot.items;
    const target = latest.find((item) => item.id === id && item.recipientUserId === currentUser.id);
    if (!target) { setItems(latest); setError("Это уведомление больше недоступно. Список обновлён."); return false; }
    if (target.read) return true;
    return persist(latest.map((item) => item.id === id && item.recipientUserId === currentUser.id ? { ...item, read: true } : item));
  };
  const markAllRead = () => {
    const snapshot = readNotificationState();
    if (snapshot.error) { refreshItems(); setError(snapshot.error); return; }
    if (persist(snapshot.items.map((item) => item.recipientUserId === currentUser.id ? { ...item, read: true } : item))) {
      setMessage("Уведомления отмечены прочитанными."); restoreFilterFocus();
    }
  };
  const markSingleRead = (id: string) => {
    if (markRead(id)) { setMessage("Уведомление отмечено прочитанным."); restoreFilterFocus(); }
  };

  return <section className={`${styles.panel} ${compact ? styles.compact : ""}`}>
    <div className={styles.tools}>
      <header className={styles.header}>
        <div>
          {!compact && <><span className={styles.eyebrow}>События кабинета</span><h2>Последние уведомления</h2></>}
          <p className={styles.summary}><span className={`${styles.summaryIcon} ${readError ? styles.summaryError : unreadCount ? styles.hasUnread : ""}`} aria-hidden="true">{readError ? "!" : unreadCount ? "" : "✓"}</span>{readError ? "История уведомлений недоступна" : unreadCount ? `Новых: ${unreadCount}` : userItems.length ? "Всё прочитано" : "Новых событий пока нет"}</p>
        </div>
        {unreadCount > 0 && <button className={styles.readAll} type="button" disabled={Boolean(readError)} onClick={markAllRead}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m2 10 4 4 8-8m-4 7 2 2 7-8" /></svg>Прочитать все</button>}
      </header>

      {userItems.length > 0 && <>
        <div className={styles.toolbar}>
          <div ref={filtersRef} className={styles.filters} role="group" aria-label="Фильтр уведомлений">
            <button type="button" className={filter === "all" ? styles.activeFilter : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Все <span>{userItems.length}</span></button>
            <button type="button" className={filter === "unread" ? styles.activeFilter : ""} aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>Непрочитанные <span>{unreadCount}</span></button>
          </div>
          {compact && <button type="button" className={`${styles.searchToggle} ${searchOpen ? styles.searchActive : ""}`} aria-label={searchOpen ? "Закрыть поиск уведомлений" : "Найти уведомление"} title={searchOpen ? "Закрыть поиск" : "Поиск уведомлений"} aria-expanded={searchOpen} aria-controls={searchOpen ? searchId : undefined} onClick={toggleSearch}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{searchOpen ? <path d="m5 5 10 10M15 5 5 15" /> : <><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></>}</svg></button>}
        </div>
        {(!compact || searchOpen) && <div id={searchId} ref={searchRef} className={`${styles.searchTools} ${compact ? styles.compactSearch : ""}`}><SearchField label="Поиск уведомлений" placeholder="Название, событие или комментарий" value={query} onChange={setQuery} />{!compact && <Dropdown label="Тип события" value={kind} onChange={(value) => setKind(value as typeof kind)} options={[{ value: "all", label: "Все события" }, ...Object.entries(notificationKindLabels).map(([value, label]) => ({ value, label }))]} />}</div>}
      </>}
      {(readError || error) && <div className={styles.error} role="alert"><span>{readError || error}</span>{readError && <button type="button" onClick={() => { setError(""); setMessage(""); refreshItems(); }}>Повторить чтение</button>}</div>}
      <p className={styles.srOnly} role="status">{message}</p>
      {searching && <p className={styles.searchResult} role="status">Найдено: {visible.length}</p>}
    </div>

    <div className={styles.list}>
      {visible.length ? Array.from(groups, ([key, group]) => <section className={styles.dayGroup} key={key} aria-label={group.label}><h3 className={styles.dayHeading}>{group.label}<span>{group.items.length}</span></h3><ul>{group.items.map((item) => <NotificationItem key={item.id} item={item} readOnly={Boolean(readError)} onRead={markRead} onMarkRead={markSingleRead} onNavigate={onNavigate} />)}</ul></section>) : !readError && <div className={styles.empty}>
        <span className={styles.emptyIcon} aria-hidden="true">{searching ? "⌕" : "✓"}</span>
        <strong>{searching ? "Ничего не найдено" : filter === "unread" ? "Всё прочитано" : "Здесь пока тихо"}</strong>
        <p>{searching ? "Попробуйте другое название или сбросьте фильтры." : filter === "unread" ? "Новых уведомлений нет. Прочитанные события доступны во вкладке «Все»." : "Новые задания, ответы и изменения расписания появятся здесь."}</p>
        {(searching || filter === "unread") && userItems.length > 0 && <button type="button" onClick={resetFilters}>Показать все уведомления</button>}
      </div>}
    </div>
    {userItems.length > 0 && <footer className={styles.footer}>{readError ? "Показан последний доступный список. Статусы не изменяются, пока чтение не восстановится." : "Открытие события отмечает его прочитанным."}</footer>}
  </section>;
};

export default Notifications;
