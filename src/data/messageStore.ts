import type { UserRole } from "../components/RoleContext";

export type MessageAttachment = { id: string; name: string; type: string; size: number };
export type StoredMessage = { id: number; incoming: boolean; text: string; time: string; attachments?: MessageAttachment[]; replyTo?: number; sentAt?: string; deliveryId?: string };
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

const DEMO_USER_IDS: Partial<Record<UserRole, string>> = { teacher: "teacher-elena-volkova", student: "anna-smirnova" };
const keyFor = (role: UserRole, userId: string) => "bi-university-messages-v2:" + role + ":" + encodeURIComponent(userId);
const DATABASE_KEY = "bi-university-messages-v3";
const CHANGE_EVENT = "bi-university-messages-change";
interface MessagingDatabase { version: 1; users: Record<string, MessagingState> }
export interface MessageIdentity { role: UserRole; id: string }
export const getMessageAttachmentScope = (identity: MessageIdentity, contactId: string) => `${identity.role}:${encodeURIComponent(identity.id)}:${encodeURIComponent(contactId)}`;
const emptyUnread = (): MessagingState["unread"] => ({ students: 0, teachers: 0, groups: 0 });
export const createEmptyMessagingState = (): MessagingState => ({ dialogIds: [], messages: {}, unread: emptyUnread() });
export interface MessagingReadState { state: MessagingState | null; error: string }
const isMessage = (value: unknown): value is StoredMessage => {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<StoredMessage>;
  const attachmentsValid = message.attachments === undefined || (Array.isArray(message.attachments) && message.attachments.length <= 5 && message.attachments.every((file) => file && typeof file.id === "string" && Boolean(file.id) && typeof file.name === "string" && typeof file.type === "string" && Number.isFinite(file.size) && file.size >= 0));
  return typeof message.id === "number" && Number.isFinite(message.id) && typeof message.incoming === "boolean" && typeof message.text === "string" && (Boolean(message.text.trim()) || Boolean(message.attachments?.length)) && typeof message.time === "string" && attachmentsValid && (message.replyTo === undefined || (typeof message.replyTo === "number" && Number.isFinite(message.replyTo))) && (message.sentAt === undefined || (typeof message.sentAt === "string" && Number.isFinite(Date.parse(message.sentAt)))) && (message.deliveryId === undefined || typeof message.deliveryId === "string" && Boolean(message.deliveryId));
};
const isGroup = (value: unknown): value is StoredMessageGroup => {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<StoredMessageGroup>;
  return typeof group.id === "string" && Boolean(group.id) && typeof group.name === "string" && Boolean(group.name.trim()) && Array.isArray(group.memberIds) && group.memberIds.every((id) => typeof id === "string") && typeof group.createdAt === "number" && Number.isFinite(group.createdAt);
};

const normalizeState = (parsed: unknown): MessagingState => {
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
      return {
        dialogIds: [...new Set(value.dialogIds)],
        messages: value.messages,
        unread,
        ...(Array.isArray(value.groups) ? { groups: value.groups.filter(isGroup).map((group) => ({ ...group, memberIds: [...new Set(group.memberIds)] })) } : {}),
        ...(Array.isArray(value.leftGroupIds) ? { leftGroupIds: [...new Set(value.leftGroupIds)] } : {}),
      };
};

const readDatabase = (): MessagingDatabase => {
  const saved = localStorage.getItem(DATABASE_KEY);
  if (saved === null) return { version: 1, users: {} };
  const parsed = JSON.parse(saved) as Partial<MessagingDatabase> | null;
  if (!parsed || parsed.version !== 1 || !parsed.users || typeof parsed.users !== "object" || Array.isArray(parsed.users)) throw new Error("Invalid shared messaging database");
  return parsed as MessagingDatabase;
};

const readUser = (database: MessagingDatabase, role: UserRole, userId: string): MessagingState | null => {
  if (!userId) throw new Error("Для переписки требуется ID учётной записи.");
  const key = keyFor(role, userId);
  if (Object.hasOwn(database.users, key)) return normalizeState(database.users[key]);
  const saved = localStorage.getItem(key);
  // Original keys are kept as backups; migration belongs to the same identity.
  const legacy = saved === null && userId === DEMO_USER_IDS[role] ? localStorage.getItem("bi-university-messages-v1:" + role) : null;
  return saved === null && legacy === null ? null : normalizeState(JSON.parse(saved ?? legacy!));
};

const writeDatabase = (database: MessagingDatabase, changed: string[]) => {
  // One write commits both mailboxes, so quota failures cannot deliver only one half.
  localStorage.setItem(DATABASE_KEY, JSON.stringify(database));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: changed }));
};

const readMessagingState = (role: UserRole, userId = DEMO_USER_IDS[role] ?? ""): MessagingReadState => {
    try { return { state: readUser(readDatabase(), role, userId), error: "" }; }
    catch (error) {
      console.error("Не удалось прочитать сохранённую переписку:", error);
      return { state: null, error: "Не удалось прочитать сохранённую переписку. Запись приостановлена, чтобы не потерять историю. Исходные данные не изменены; попробуйте повторить чтение." };
    }
};

export const messageRepository = {
  readState: readMessagingState,
  subscribe(role: UserRole, userId: string, listener: () => void) {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === DATABASE_KEY || event.key === keyFor(role, userId) || (userId === DEMO_USER_IDS[role] && event.key === "bi-university-messages-v1:" + role)) listener();
    };
    const onChange = (event: Event) => { if ((event as CustomEvent<string[]>).detail.includes(keyFor(role, userId))) listener(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(CHANGE_EVENT, onChange); };
  },
  read(role: UserRole, userId = DEMO_USER_IDS[role] ?? ""): MessagingState | null {
    return readMessagingState(role, userId).state;
  },

  save(role: UserRole, state: MessagingState, userId = DEMO_USER_IDS[role] ?? "") {
    try {
      const database = readDatabase();
      readUser(database, role, userId);
      database.users[keyFor(role, userId)] = normalizeState(state);
      writeDatabase(database, [keyFor(role, userId)]);
      return true;
    } catch (error) {
      console.error("Не удалось сохранить переписку:", error);
      return false;
    }
  },

  deliverDirect(sender: MessageIdentity, recipient: MessageIdentity, message: StoredMessage, recipientAttachments: MessageAttachment[], fallback?: MessagingState, recovering = false): MessagingReadState {
    try {
      if (!sender.id || !recipient.id || sender.id === recipient.id || message.incoming || !isMessage(message) || !message.deliveryId) throw new Error("Invalid direct message delivery");
      const database = readDatabase();
      const own = readUser(database, sender.role, sender.id) ?? fallback ?? createEmptyMessagingState();
      const peer = readUser(database, recipient.role, recipient.id) ?? createEmptyMessagingState();
      const ownThread = own.messages[recipient.id] ?? [];
      const peerThread = peer.messages[sender.id] ?? [];
      if (!recovering && message.replyTo !== undefined && !ownThread.some((item) => item.id === message.replyTo)) throw new Error("Reply target is no longer available");
      if (ownThread.some((item) => item.deliveryId === message.deliveryId)) return { state: own, error: "" };
      const previous = recovering ? ownThread.find((item) => item.id === message.id && !item.incoming && item.sentAt === message.sentAt && item.text === message.text) : undefined;
      if (recovering && !previous) throw new Error("Message changed before recovery");
      const duplicate = peerThread.find((item) => item.deliveryId === message.deliveryId);
      const collision = [...ownThread.filter((item) => item !== previous), ...peerThread].some((item) => item.id === message.id);
      const id = duplicate?.id ?? (collision ? [...ownThread, ...peerThread].reduce((maximum, item) => Math.max(maximum, item.id), message.id) + 1 : message.id);
      const outgoing = recovering && previous ? { ...previous, deliveryId: message.deliveryId, id } : { ...message, id };
      const incoming = { ...outgoing, incoming: true, attachments: recipientAttachments.length ? recipientAttachments : undefined };
      const senderTab: MessageTab = recipient.role === "teacher" ? "teachers" : "students";
      const recipientTab: MessageTab = sender.role === "teacher" ? "teachers" : "students";
      const nextOwn: MessagingState = { ...own, dialogIds: [...new Set([recipient.id, ...own.dialogIds])], messages: { ...own.messages, [recipient.id]: recovering ? ownThread.map((item) => item === previous ? outgoing : item.replyTo === message.id && id !== message.id ? { ...item, replyTo: id } : item) : [...ownThread, outgoing] }, unread: { ...own.unread, [senderTab]: 0 } };
      const nextPeer: MessagingState = { ...peer, dialogIds: [...new Set([sender.id, ...peer.dialogIds])], messages: { ...peer.messages, [sender.id]: duplicate ? peerThread : [...peerThread, incoming].sort((a, b) => a.id - b.id) }, unread: { ...peer.unread, [recipientTab]: peer.unread[recipientTab] + (duplicate ? 0 : 1) } };
      database.users[keyFor(sender.role, sender.id)] = normalizeState(nextOwn);
      database.users[keyFor(recipient.role, recipient.id)] = normalizeState(nextPeer);
      writeDatabase(database, [keyFor(sender.role, sender.id), keyFor(recipient.role, recipient.id)]);
      return { state: nextOwn, error: "" };
    } catch (error) {
      console.error("Не удалось доставить личное сообщение:", error);
      return { state: null, error: "Не удалось доставить сообщение. Проверьте доступ к хранилищу браузера и повторите отправку. Черновик сохранён." };
    }
  },
};
