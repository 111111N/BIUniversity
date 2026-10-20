import type { StoredMessage } from "../../../data/messageStore";
import { dialogTime, messagePreview, type MessagingContact } from "../../../domain/messaging";
import MessageActionIcon from "../MessageActionIcon";
import styles from "./index.module.scss";

interface Props { contact: MessagingContact; message?: StoredMessage; draft?: string; fileCount?: number; active: boolean; onClick(): void }
export default function DialogListItem({ contact, message, draft = "", fileCount = 0, active, onClick }: Props) {
  const hasDraft = Boolean(draft.trim() || fileCount);
  return <button type="button" className={`${styles.item} ${active ? styles.active : ""}`} aria-current={active ? "true" : undefined} onClick={onClick}>
    <span className={`${styles.avatar} ${styles[contact.kind]}`}>{contact.kind === "group" ? <MessageActionIcon name="group" /> : contact.initials}</span>
    <span className={styles.content}><span className={styles.top}><strong>{contact.name}</strong>{message && <time dateTime={message.sentAt}>{dialogTime(message)}</time>}</span>
      <span className={styles.preview}>{hasDraft ? <><em>Черновик: </em>{draft.trim() || `${fileCount} файл(ов)`}</> : message ? <>{!message.incoming && <span>Вы: </span>}{messagePreview(message)}</> : contact.subtitle}</span>
      {!message && !hasDraft && <small>Начать диалог</small>}
    </span>
  </button>;
}
