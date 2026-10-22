import { messageRepository, getMessageAttachmentScope, type MessageIdentity, type MessagingState, type StoredMessage } from "./messageStore";
import { messageAttachmentRepository } from "./messageAttachmentRepository";

export const deliverDirectMessage = async (sender: MessageIdentity, recipient: MessageIdentity, message: StoredMessage, fallback?: MessagingState, recovering = false) => {
  const sourceScope = getMessageAttachmentScope(sender, recipient.id);
  const targetScope = getMessageAttachmentScope(recipient, sender.id);
  const outgoing = { ...message, deliveryId: message.deliveryId ?? crypto.randomUUID() };
  const current = messageRepository.readState(sender.role, sender.id);
  if (current.error) throw new Error(current.error);
  if (current.state?.messages[recipient.id]?.some((item) => item.deliveryId === outgoing.deliveryId)) return current.state;
  let copies: Awaited<ReturnType<typeof messageAttachmentRepository.copy>> = [];
  let committed = false;
  try {
    copies = await messageAttachmentRepository.copy(sourceScope, targetScope, (message.attachments ?? []).map((file) => file.id));
    const result = messageRepository.deliverDirect(sender, recipient, outgoing, copies, fallback, recovering);
    if (!result.state || result.error) throw new Error(result.error);
    committed = true;
    // A concurrent recovery can finish first; discard only unused temporary copies.
    const actual = messageRepository.read(recipient.role, recipient.id)?.messages[sender.id]?.find((item) => item.deliveryId === outgoing.deliveryId);
    const unused = actual ? copies.filter((copy) => !actual.attachments?.some((file) => file.id === copy.id)) : [];
    if (unused.length) {
      try { await messageAttachmentRepository.remove(targetScope, unused.map((file) => file.id)); }
      catch (error) { console.error("Не удалось очистить временные копии вложений:", error); }
    }
    return result.state;
  } catch (error) {
    console.error("Не удалось подготовить доставку сообщения:", error);
    if (!committed && copies.length) {
      try { await messageAttachmentRepository.remove(targetScope, copies.map((file) => file.id)); }
      catch (cleanupError) { console.error("Не удалось очистить вложения неотправленного сообщения:", cleanupError); }
    }
    throw error;
  }
};

let recovery: Promise<string[]> | null = null;

export const recoverDemoDirectMessages = (identities: MessageIdentity[]) => {
  if (recovery) return recovery;
  recovery = (async () => {
    const warnings: string[] = [];
    const recipients = new Map(identities.map((identity) => [identity.id, identity]));
    const senders: MessageIdentity[] = [{ role: "student", id: "anna-smirnova" }, { role: "teacher", id: "teacher-elena-volkova" }];
    for (const sender of senders) {
      const snapshot = messageRepository.readState(sender.role, sender.id);
      if (snapshot.error) { warnings.push(snapshot.error); continue; }
      for (const [contactId, thread] of Object.entries(snapshot.state?.messages ?? {})) {
        const recipient = recipients.get(contactId);
        if (!recipient || recipient.id === sender.id) continue;
        // Untimed example messages have no reliable sender and are never forwarded.
        for (const message of thread.filter((item) => !item.incoming && item.sentAt && !item.deliveryId)) {
          try {
            await deliverDirectMessage(sender, recipient, { ...message, deliveryId: `legacy:${sender.id}:${recipient.id}:${message.id}` }, undefined, true);
          } catch (error) {
            console.error("Не удалось восстановить доставку сохранённого сообщения:", error);
            warnings.push("Часть прежних сообщений пока не доставлена. История сохранена; откройте переписку повторно или повторите отправку вложений.");
          }
        }
      }
    }
    return [...new Set(warnings)];
  })().finally(() => { recovery = null; });
  return recovery;
};
