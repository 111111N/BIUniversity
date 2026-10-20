import { Link } from "react-router-dom";
import type { AppNotification } from "../../../data/notificationStore";
import styles from "./index.module.scss";

export const notificationKindLabels: Record<AppNotification["kind"], string> = {
  assignment: "Задание", submission: "Ответ", grade: "Оценка", revision: "Доработка", schedule: "Расписание",
};

const actionLabels: Record<AppNotification["kind"], string> = {
  assignment: "Открыть задание", submission: "Посмотреть ответ", grade: "Посмотреть оценку", revision: "Посмотреть замечания", schedule: "Открыть расписание",
};
const timeFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const fullDateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" });

interface Props {
  item: AppNotification;
  onRead(id: string): boolean;
  onMarkRead(id: string): void;
  onNavigate?(): void;
  readOnly?: boolean;
}

const EventIcon = ({ kind }: { kind: AppNotification["kind"] }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {kind === "assignment" && <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z" /><path d="M14 3v5h5M8 12h8M8 16h5" /></>}
  {kind === "submission" && <><path d="M4 14v5h16v-5M12 3v11M8 10l4 4 4-4" /></>}
  {kind === "grade" && <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" /></>}
  {kind === "revision" && <><path d="M4 10a8 8 0 1 1 2 8M4 4v6h6" /><path d="M12 7v5l3 2" /></>}
  {kind === "schedule" && <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 11h16M8 15h2M14 15h2M8 18h2" /></>}
</svg>;

const ReadIcon = () => <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 10s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5S2 10 2 10Z" /><circle cx="10" cy="10" r="2.3" /></svg>;

const NotificationItem = ({ item, onRead, onMarkRead, onNavigate, readOnly = false }: Props) => {
  const date = new Date(item.createdAt);
  return <li className={`${styles.row} ${!item.read ? styles.unread : ""}`}>
    <Link className={styles.link} to={item.href} onClick={(event) => {
      if (!onRead(item.id)) { event.preventDefault(); return; }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) onNavigate?.();
    }}>
      <span className={`${styles.icon} ${styles[item.kind]}`}><EventIcon kind={item.kind} /></span>
      <div className={styles.content}>
        <div className={styles.meta}><span>{notificationKindLabels[item.kind]}</span><time dateTime={item.createdAt} title={fullDateFormat.format(date)}>{timeFormat.format(date)}</time></div>
        <strong>{!item.read && <span className={styles.unreadDot} role="img" aria-label="Непрочитанное" />}{item.title}</strong>
        {item.body && <p>{item.body}</p>}
        <span className={styles.action}>{actionLabels[item.kind]}<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" /></svg></span>
      </div>
    </Link>
    {!item.read && <div className={styles.readAction}>
      <button type="button" disabled={readOnly} onClick={() => onMarkRead(item.id)} aria-label={`Отметить прочитанным: ${item.title}`} title={readOnly ? "Сначала восстановите чтение уведомлений" : "Отметить прочитанным"}><ReadIcon /></button>
    </div>}
  </li>;
};

export default NotificationItem;
