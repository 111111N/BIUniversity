import type { StoredMessage } from "../data/messageStore";
import { checkBackupAbort } from "./localBackup";

interface ReplyChainFinding { level: "error" | "review"; code: string; message: string; id: number }

/** Inspect a validated thread without assuming that numeric IDs or display times encode chronology. */
export const inspectArchivedReplyChains = async (rows: readonly StoredMessage[], signal?: AbortSignal) => {
  const findings: ReplyChainFinding[] = [];
  const byNumber = new Map<number, StoredMessage>(); const finished = new Set<number>(); const cyclic = new Set<number>();
  let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  for (const row of rows) { await step(); byNumber.set(row.id, row); }
  for (const row of rows) {
    await step(); if (finished.has(row.id)) continue;
    const path: StoredMessage[] = []; const positions = new Map<number, number>();
    let cursor: StoredMessage | undefined = row;
    while (cursor && !finished.has(cursor.id)) {
      await step();
      const position = positions.get(cursor.id);
      if (position !== undefined) {
        // A single self-reference already has a local mailbox finding. Report each longer cycle once.
        if (path.length - position > 1) {
          findings.push({ level: "error", code: "cyclic-message-replies", id: cursor.id, message: "В цепочке ответов найден замкнутый круг из нескольких сообщений. Историю ссылок нужно проверить; сообщения и ссылки не исправлялись." });
          for (let index = position; index < path.length; index++) { await step(); cyclic.add(path[index].id); }
        }
        break;
      }
      positions.set(cursor.id, path.length); path.push(cursor);
      cursor = cursor.replyTo === undefined ? undefined : byNumber.get(cursor.replyTo);
    }
    for (const item of path) { await step(); finished.add(item.id); }
  }
  for (const row of rows) {
    await step();
    const target = row.replyTo === undefined ? undefined : byNumber.get(row.replyTo);
    if (!target || target.id === row.id || cyclic.has(row.id) || cyclic.has(target.id) || row.sentAt === undefined || target.sentAt === undefined) continue;
    const sentAt = Date.parse(row.sentAt); const targetAt = Date.parse(target.sentAt);
    if (Number.isFinite(sentAt) && Number.isFinite(targetAt) && targetAt > sentAt) findings.push({
      level: "review", code: "reply-before-original", id: row.id,
      message: "Сохранённая дата исходного сообщения позже даты ответа на него. Нужно проверить даты и историю ссылок, включая возможную разницу часов; по этому расхождению сообщения не перенумеровывались и не исправлялись.",
    });
  }
  checkBackupAbort(signal);
  return findings;
};
