import type { StoredMessage } from "../data/messageStore";
export type MessagingContact = { id: string; initials: string; name: string; subtitle: string; kind: "student" | "teacher" | "group" };

export const messagePreview = (message?: StoredMessage) => message?.text || (message?.attachments?.length ? `Файл: ${message.attachments[0].name}${message.attachments.length > 1 ? ` и ещё ${message.attachments.length - 1}` : ""}` : "");

export const messageDayKey = (message: StoredMessage) => message.sentAt ? new Date(message.sentAt).toLocaleDateString("ru-RU") : "legacy";

export const messageDayLabel = (message: StoredMessage, now = new Date()) => {
  if (!message.sentAt) return "Предыдущая переписка";
  const date = new Date(message.sentAt);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return "Сегодня";
  if (date.toDateString() === yesterday.toDateString()) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
};

export const dialogTime = (message?: StoredMessage, now = new Date()) => {
  if (!message) return "";
  if (!message.sentAt) return message.time;
  const date = new Date(message.sentAt);
  return date.toDateString() === now.toDateString() ? message.time : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};
