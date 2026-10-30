import type { MessageAttachment, MessagingState, StoredMessage } from "../data/messageStore";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";

export interface ArchivedMessageMailbox { ownerId: string; state?: MessagingState }
export interface ArchivedAttachmentSide { mailbox: string; dialog: string; messageId: number; attachments: readonly MessageAttachment[] }
export interface ArchivedAttachmentPair { own: ArchivedAttachmentSide; peer: ArchivedAttachmentSide }
interface ThreadIndex { byDelivery: Map<string, StoredMessage[]>; byNumber: Map<number, StoredMessage> }
interface MailboxIndex extends ArchivedMessageMailbox { key: string; groups: Set<string>; threads: Map<string, ThreadIndex> }
const attachmentMetadata = (row: StoredMessage) => JSON.stringify((row.attachments ?? []).map(({ name, type, size }) => [name, type, size]));
const uniqueAttachments = (row: StoredMessage) => new Set(row.attachments?.map((file) => file.id)).size === (row.attachments?.length ?? 0);
type ReplyComparison = "mismatch" | "incomplete" | "unidentified" | "ambiguous";
const compareReplyTargets = (row: StoredMessage, other: StoredMessage, own: ThreadIndex, peer: ThreadIndex): ReplyComparison | undefined => {
  if (row.replyTo === undefined && other.replyTo === undefined) return;
  const target = row.replyTo === undefined ? undefined : own.byNumber.get(row.replyTo);
  const otherTarget = other.replyTo === undefined ? undefined : peer.byNumber.get(other.replyTo);
  // Missing/self references are already reported by the local mailbox check; do not invent a target.
  if ((row.replyTo !== undefined && (!target || target.id === row.id)) || (other.replyTo !== undefined && (!otherTarget || otherTarget.id === other.id))) return;
  if (!target || !otherTarget) return "incomplete";
  if (target.deliveryId === undefined || otherTarget.deliveryId === undefined) return "unidentified";
  if (own.byDelivery.get(target.deliveryId)?.length !== 1 || peer.byDelivery.get(otherTarget.deliveryId)?.length !== 1) return "ambiguous";
  if (target.deliveryId !== otherTarget.deliveryId) return "mismatch";
};
const REPLY_REVIEWS = {
  incomplete: { code: "incomplete-message-reply", message: "Ссылка ответа сохранена только у одной копии сообщения. Причину и историю изменения нужно проверить; ссылка не дописана." },
  unidentified: { code: "unidentified-reply-target", message: "У исходного сообщения ответа нет ID доставки хотя бы в одном ящике. Совпадение номеров или текста не подтверждает общий источник; ссылка требует проверки." },
  ambiguous: { code: "ambiguous-reply-target", message: "ID доставки исходного сообщения ответа повторяется в диалоге. Источник не выбран автоматически; ссылка требует проверки." },
} as const;

/** Compare only validated v3 mailboxes with unambiguous owners; never borrow copies from v1/v2. */
export const inspectArchivedMessageDelivery = async (mailboxes: ReadonlyMap<string, ArchivedMessageMailbox>, accountIds?: ReadonlySet<string>, signal?: AbortSignal, onAttachmentPair?: (pair: ArchivedAttachmentPair) => void) => {
  const issues: BackupDocumentIssue[] = [];
  const owners = new Map<string, MailboxIndex[]>();
  let comparedPairs = 0; let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const finding = (level: "error" | "review", code: string, mailbox: string, contact: string, message: string, row?: StoredMessage) => issues.push({
    kind: "messaging", level, code, referenceId: "bi-university-messages-v3", recordId: JSON.stringify(row ? [mailbox, contact, row.id] : [mailbox, contact]), message,
  });
  for (const [key, mailbox] of mailboxes) {
    await step();
    const indexed: MailboxIndex = { ...mailbox, key, groups: new Set(mailbox.state?.groups?.map((group) => group.id)), threads: new Map() };
    const buckets = owners.get(mailbox.ownerId) ?? []; buckets.push(indexed); owners.set(mailbox.ownerId, buckets);
    for (const [contact, rows] of Object.entries(mailbox.state?.messages ?? {})) {
      await step(); const byDelivery = new Map<string, StoredMessage[]>(); const byNumber = new Map<number, StoredMessage>();
      for (const row of rows) {
        await step(); byNumber.set(row.id, row); if (row.deliveryId === undefined) continue;
        const copies = byDelivery.get(row.deliveryId) ?? []; copies.push(row); byDelivery.set(row.deliveryId, copies);
      }
      indexed.threads.set(contact, { byDelivery, byNumber });
    }
  }
  const visited = new Set<string>();
  for (const buckets of owners.values()) for (const own of buckets) {
    for (const [contact, thread] of own.threads) {
      await step();
      const rows = own.state!.messages[contact];
      if (!accountIds?.has(own.ownerId) || !accountIds.has(contact) || own.groups.has(contact)) continue;
      // Missing delivery IDs cannot be reconstructed reliably from text, time or a numeric ID.
      if (rows.some((row) => row.sentAt !== undefined && row.deliveryId === undefined)) finding("review", "unidentified-message-delivery", own.key, contact, "У части датированных сообщений нет ID доставки. Копии не сопоставлялись по тексту, времени или номеру; сообщения не отправлялись повторно.");
      if (!thread.byDelivery.size) continue;
      const peers = owners.get(contact) ?? [];
      if (buckets.length !== 1 || peers.length > 1 || own.ownerId === contact) {
        finding("review", "ambiguous-delivery-mailbox", own.key, contact, "Для участника найдено несколько ящиков с разными типами учётки или диалог с самим собой. Исторический тип не выбран автоматически; доставка требует проверки."); continue;
      }
      const peer = peers[0];
      if (!peer || !peer.state) {
        finding("review", "unchecked-delivery-mailbox", own.key, contact, "Вторая сторона отсутствует в общем документе или её ящик не читается. Старые копии не подставлялись; доставка и возможное удаление истории требуют проверки."); continue;
      }
      if (peer.groups.has(own.ownerId)) {
        finding("review", "ambiguous-delivery-contact", own.key, contact, "ID личного контакта совпадает с ID беседы у другой стороны. Тип переписки не выбран автоматически; доставка требует проверки."); continue;
      }
      const peerThread = peer.threads.get(own.ownerId);
      for (const [delivery, copies] of thread.byDelivery) {
        await step(); if (copies.length !== 1) continue;
        const row = copies[0]; const token = JSON.stringify([own.key, contact, delivery]);
        if (visited.has(token)) continue;
        const matches = peerThread?.byDelivery.get(delivery) ?? [];
        if (!peerThread || matches.length !== 1) {
          finding("review", matches.length ? "ambiguous-message-delivery" : "missing-message-copy", own.key, contact, matches.length
            ? "В другом ящике ID доставки соответствует нескольким сообщениям. Копия не выбрана автоматически."
            : "В другом ящике не найдена копия с этим ID доставки. Возможны удаление переписки или неполный архив; сообщение не отправлено повторно.", row);
          continue;
        }
        const other = matches[0];
        visited.add(token); visited.add(JSON.stringify([peer.key, own.ownerId, delivery])); comparedPairs++;
        const fields: string[] = [];
        if (row.incoming === other.incoming) fields.push("направление");
        if (row.text !== other.text) fields.push("текст");
        if (row.sentAt !== undefined && other.sentAt !== undefined && Date.parse(row.sentAt) !== Date.parse(other.sentAt)) fields.push("время отправки");
        const sameAttachments = attachmentMetadata(row) === attachmentMetadata(other);
        if (!sameAttachments) fields.push("метаданные вложений");
        if (row.incoming !== other.incoming && sameAttachments && row.attachments?.length && uniqueAttachments(row) && uniqueAttachments(other)) onAttachmentPair?.({
          own: { mailbox: own.key, dialog: contact, messageId: row.id, attachments: row.attachments },
          peer: { mailbox: peer.key, dialog: own.ownerId, messageId: other.id, attachments: other.attachments ?? [] },
        });
        const reply = compareReplyTargets(row, other, thread, peerThread);
        if (reply === "mismatch") fields.push("ссылка ответа");
        else if (reply) {
          const review = REPLY_REVIEWS[reply]; finding("review", review.code, own.key, contact, review.message, row);
        }
        if (fields.length) finding("error", "message-copy-mismatch", own.key, contact, `Копии с одним ID доставки расходятся: ${fields.join(", ")}. Значения не включены в отчёт, копии не исправлялись.`, row);
        if ((row.sentAt === undefined) !== (other.sentAt === undefined)) finding("review", "incomplete-delivery-time", own.key, contact, "Время отправки сохранено только у одной копии. Сопоставление дат требует проверки; отсутствующая дата не дописана.", row);
        if (row.id !== other.id) finding("review", "different-delivery-numbers", own.key, contact, "Копии с одним ID доставки имеют разные номера сообщений. Перед восстановлением нужно проверить ссылки ответов и историю перенумерации; номера не изменены.", row);
      }
    }
  }
  checkBackupAbort(signal);
  return { issues, comparedPairs };
};
