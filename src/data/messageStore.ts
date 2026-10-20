import type { UserRole } from "../components/RoleContext";

export type MessageAttachment = { id: string; name: string; type: string; size: number };
export type StoredMessage = { id: number; incoming: boolean; text: string; time: string; attachments?: MessageAttachment[]; replyTo?: number; sentAt?: string };
export type MessageTab = "students" | "teachers" | "groups";

export interface StoredMessageGroup {
  id: string;
  name: string;
  memberIds: string[];
  createdAt: number;
}

export interface MessagingState {
  dialogIds: string[];
  messages: Record<string, StoredMessage[]>;
  unread: Record<MessageTab, number>;
  groups?: StoredMessageGroup[];
  leftGroupIds?: string[];
}

const DEMO_USER_IDS: Record<UserRole, string> = { teacher: "teacher-elena-volkova", student: "anna-smirnova" };
const keyFor = (role: UserRole, userId: string) => "bi-university-messages-v2:" + role + ":" + encodeURIComponent(userId);
const emptyUnread = (): MessagingState["unread"] => ({ students: 0, teachers: 0, groups: 0 });
export const createEmptyMessagingState = (): MessagingState => ({ dialogIds: [], messages: {}, unread: emptyUnread() });
export interface MessagingReadState { state: MessagingState | null; error: string }
const isMessage = (value: unknown): value is StoredMessage => {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<StoredMessage>;
  const attachmentsValid = message.attachments === undefined || (Array.isArray(message.attachments) && message.attachments.length <= 5 && message.attachments.every((file) => file && typeof file.id === "string" && Boolean(file.id) && typeof file.name === "string" && typeof file.type === "string" && Number.isFinite(file.size) && file.size >= 0));
  return typeof message.id === "number" && Number.isFinite(message.id) && typeof message.incoming === "boolean" && typeof message.text === "string" && (Boolean(message.text.trim()) || Boolean(message.attachments?.length)) && typeof message.time === "string" && attachmentsValid && (message.replyTo === undefined || (typeof message.replyTo === "number" && Number.isFinite(message.replyTo))) && (message.sentAt === undefined || (typeof message.sentAt === "string" && Number.isFinite(Date.parse(message.sentAt))));
};
const isGroup = (value: unknown): value is StoredMessageGroup => {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<StoredMessageGroup>;
  return typeof group.id === "string" && Boolean(group.id) && typeof group.name === "string" && Boolean(group.name.trim()) && Array.isArray(group.memberIds) && group.memberIds.every((id) => typeof id === "string") && typeof group.createdAt === "number" && Number.isFinite(group.createdAt);
};

const readMessagingState = (role: UserRole, userId = DEMO_USER_IDS[role]): MessagingReadState => {
    try {
      const saved = localStorage.getItem(keyFor(role, userId));
      // Old role-only history belongs exclusively to the original demo identity.
      const legacy = saved === null && userId === DEMO_USER_IDS[role] ? localStorage.getItem("bi-university-messages-v1:" + role) : null;
      if (saved === null && legacy === null) return { state: null, error: "" };
      const parsed: unknown = JSON.parse(saved ?? legacy ?? "null");
      if (!parsed || typeof parsed !== "object" || !("dialogIds" in parsed) || !("messages" in parsed)) throw new Error("Invalid messaging data");
      const value = parsed as Partial<MessagingState>;
      if (!Array.isArray(value.dialogIds) || !value.dialogIds.every((id) => typeof id === "string" && Boolean(id.trim())) || !value.messages || typeof value.messages !== "object" || Array.isArray(value.messages)) throw new Error("Invalid dialogs");
      if (Object.entries(value.messages).some(([id, messages]) => !id.trim() || !Array.isArray(messages) || !messages.every(isMessage) || new Set(messages.map((message) => message.id)).size !== messages.length)) throw new Error("Invalid messages");
      if (value.groups !== undefined && (!Array.isArray(value.groups) || !value.groups.every(isGroup))) throw new Error("Invalid conversations");
      if (value.leftGroupIds !== undefined && (!Array.isArray(value.leftGroupIds) || !value.leftGroupIds.every((id) => typeof id === "string" && Boolean(id.trim())))) throw new Error("Invalid conversation membership");
      const unread = emptyUnread();
      for (const tab of ["students", "teachers", "groups"] as const) {
        const count = value.unread?.[tab];
        if (typeof count === "number" && Number.isFinite(count) && count > 0) unread[tab] = Math.floor(count);
      }
      return { state: {
        dialogIds: [...new Set(value.dialogIds)],
        messages: value.messages,
        unread,
        ...(Array.isArray(value.groups) ? { groups: value.groups.filter(isGroup).map((group) => ({ ...group, memberIds: [...new Set(group.memberIds)] })) } : {}),
        ...(Array.isArray(value.leftGroupIds) ? { leftGroupIds: [...new Set(value.leftGroupIds)] } : {}),
      }, error: "" };
    } catch {
      return { state: null, error: "Не удалось прочитать сохранённую переписку. Запись приостановлена, чтобы не потерять историю. Исходные данные не изменены; попробуйте повторить чтение." };
    }
};

export const messageRepository = {
  readState: readMessagingState,
  subscribe(role: UserRole, userId: string, listener: () => void) {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === keyFor(role, userId) || (userId === DEMO_USER_IDS[role] && event.key === "bi-university-messages-v1:" + role)) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  },
  read(role: UserRole, userId = DEMO_USER_IDS[role]): MessagingState | null {
    return readMessagingState(role, userId).state;
  },

  save(role: UserRole, state: MessagingState, userId = DEMO_USER_IDS[role]) {
    try {
      if (readMessagingState(role, userId).error) return false;
      localStorage.setItem(keyFor(role, userId), JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  },
};
