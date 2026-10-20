import type { UserRole } from "../components/RoleContext";

interface MessageDraftReadState { text?: string; error: string }
interface MessageDraftWriteState { error: string }

// Only text is stored here. Files and reply targets have a different lifecycle.
export const getMessageDraftKey = (role: UserRole, userId: string, dialogId: string) =>
  `bi-university-message-draft:${JSON.stringify([role, userId, dialogId])}`;

export const readMessageDraft = (key: string): MessageDraftReadState => {
  try {
    const saved = sessionStorage.getItem(key);
    if (saved === null) return { error: "" };
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1
      || !("text" in value) || typeof value.text !== "string" || value.text.length > 16000) throw new Error("Invalid message draft");
    return { text: value.text, error: "" };
  } catch {
    return { error: "Не удалось восстановить текстовый черновик из этой вкладки. Сохранённые данные не изменены. Можно ввести и отправить сообщение вручную." };
  }
};

export const saveMessageDraft = (key: string, text: string): MessageDraftWriteState => {
  const snapshot = readMessageDraft(key);
  if (snapshot.error) return { error: snapshot.error };
  try {
    if (!text || text.length > 16000) throw new Error("Invalid message draft text");
    sessionStorage.setItem(key, JSON.stringify({ version: 1, text }));
    return { error: "" };
  } catch {
    return { error: "Текст пока только в памяти: не удалось сохранить черновик в этой вкладке. Отправка доступна, но после ухода из раздела новые изменения могут потеряться." };
  }
};

export const removeMessageDraft = (key: string): MessageDraftWriteState => {
  const snapshot = readMessageDraft(key);
  if (snapshot.error) return { error: "Не удалось прочитать и очистить сохранённый черновик. Исходные данные не изменены; старый текст может появиться при возвращении." };
  try {
    if (snapshot.text !== undefined) sessionStorage.removeItem(key);
    return { error: "" };
  } catch {
    return { error: "Не удалось удалить сохранённый черновик из этой вкладки. Старый текст может появиться при возвращении." };
  }
};
