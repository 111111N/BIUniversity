import type { UserRole } from "../components/RoleContext";

export type NotificationKind = "assignment" | "submission" | "grade" | "revision" | "schedule";

export interface AppNotification {
  id: string;
  recipientUserId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
  dedupeKey?: string;
}

type AddNotificationInput = Pick<AppNotification, "kind" | "title" | "body" | "href"> & {
  recipientUserId?: string;
  /** @deprecated Передавайте recipientUserId. Поле оставлено для совместимости старых вызовов. */
  recipientRole?: UserRole;
  dedupeKey?: string;
};

type StoredNotifications = {
  version: 2;
  items: AppNotification[];
};

export interface NotificationReadState {
  items: AppNotification[];
  error: string;
}

const STORAGE_KEY = "bi-university-demo-notifications";
const CHANGE_EVENT = "bi-university-notifications-change";
const STORAGE_VERSION = 2;
const AUTO_DEDUPE_WINDOW_MS = 60_000;

const ROLE_RECIPIENTS: Record<UserRole, string> = {
  teacher: "teacher-elena-volkova",
  student: "anna-smirnova",
};

const notificationKinds: NotificationKind[] = ["assignment", "submission", "grade", "revision", "schedule"];

const initialNotifications: AppNotification[] = [
  {
    id: "student-schedule-change",
    recipientUserId: ROLE_RECIPIENTS.student,
    kind: "schedule",
    title: "Изменилась аудитория",
    body: "Линейная алгебра 14 сентября пройдёт в аудитории 318.",
    href: "/schedule",
    createdAt: "2026-09-12T08:30:00",
    read: false,
  },
  {
    id: "teacher-new-answer",
    recipientUserId: ROLE_RECIPIENTS.teacher,
    kind: "submission",
    title: "Получен новый ответ",
    body: "Анна Смирнова отправила расчётно-графическую работу.",
    href: "/journal/theory-of-probability/112-mko?tab=assignments&assignment=linear-algebra-rgr-2",
    createdAt: "2026-09-12T10:15:00",
    read: false,
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const isNotificationKind = (value: unknown): value is NotificationKind => (
  typeof value === "string" && notificationKinds.includes(value as NotificationKind)
);

const normalizeHref = (value: unknown) => {
  if (typeof value !== "string") return "/notifications";
  const href = value.trim();
  return href.startsWith("/") && !href.startsWith("//") && !href.includes("\\") && !/[\u0000-\u001f\u007f]/.test(href) ? href : "/notifications";
};

const normalizeDate = (value: unknown) => {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
};

const legacyId = (index: number, createdAt: string) => `migrated-${createdAt.replace(/\D/g, "")}-${index}`;

const normalizeNotification = (value: unknown, index: number): AppNotification | null => {
  if (!isRecord(value) || !isNotificationKind(value.kind)) return null;
  if ((value.body !== undefined && typeof value.body !== "string") || (value.read !== undefined && typeof value.read !== "boolean")) return null;

  const title = typeof value.title === "string" ? value.title.trim() : "";
  const body = typeof value.body === "string" ? value.body.trim() : "";
  const createdAt = normalizeDate(value.createdAt);
  const legacyRole = value.recipientRole === "teacher" || value.recipientRole === "student"
    ? value.recipientRole
    : null;
  const recipientUserId = typeof value.recipientUserId === "string"
    ? value.recipientUserId.trim()
    : typeof value.userId === "string"
      ? value.userId.trim()
      : legacyRole
        ? ROLE_RECIPIENTS[legacyRole]
        : "";

  if (!title || !createdAt || !recipientUserId) return null;

  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : legacyId(index, createdAt),
    recipientUserId,
    kind: value.kind,
    title,
    body,
    href: normalizeHref(value.href),
    createdAt,
    read: value.read === true,
    ...(typeof value.dedupeKey === "string" && value.dedupeKey.trim()
      ? { dedupeKey: value.dedupeKey.trim() }
      : {}),
  };
};

const deduplicateStoredItems = (items: AppNotification[]) => {
  const ids = new Set<string>();
  const explicitKeys = new Set<string>();

  return items.filter((item) => {
    const scopedKey = item.dedupeKey ? `${item.recipientUserId}:${item.dedupeKey}` : null;
    if (ids.has(item.id) || (scopedKey && explicitKeys.has(scopedKey))) return false;
    ids.add(item.id);
    if (scopedKey) explicitKeys.add(scopedKey);
    return true;
  });
};

const normalizeItems = (items: unknown[], currentVersion = false) => {
  if (currentVersion && items.some((item) => !isRecord(item)
    || typeof item.id !== "string" || !item.id.trim()
    || typeof item.recipientUserId !== "string" || !item.recipientUserId.trim()
    || typeof item.body !== "string" || typeof item.href !== "string" || typeof item.read !== "boolean"
    || (item.dedupeKey !== undefined && typeof item.dedupeKey !== "string"))) throw new Error("Invalid current notifications");
  const normalized = items.map(normalizeNotification);
  if (normalized.some((item) => item === null)) throw new Error("Invalid notifications");
  const sorted = normalized.filter((item): item is AppNotification => item !== null)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const unique = deduplicateStoredItems(sorted);
  if (unique.length !== items.length) throw new Error("Duplicate notifications");
  return unique;
};

const emitChange = () => window.dispatchEvent(new Event(CHANGE_EVENT));
/** Refresh all open consumers without writing to storage. */
export const refreshNotifications = () => emitChange();

const writeNotifications = (items: AppNotification[]) => {
  const payload: StoredNotifications = { version: STORAGE_VERSION, items };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  emitChange();
};

/** Reading never migrates, repairs or replaces stored data. */
export const readNotificationState = (): NotificationReadState => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return { items: initialNotifications.map((item) => ({ ...item })), error: "" };

    const parsed: unknown = JSON.parse(saved);
    const source = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && (parsed.version === undefined || parsed.version === 1 || parsed.version === STORAGE_VERSION) && Array.isArray(parsed.items)
        ? parsed.items
        : null;

    if (!source) throw new Error("Invalid notifications storage");
    return { items: normalizeItems(source, isRecord(parsed) && parsed.version === STORAGE_VERSION), error: "" };
  } catch {
    return { items: [], error: "Не удалось прочитать сохранённые уведомления. Запись приостановлена, чтобы не потерять данные. Исходная история не изменена; повторите чтение." };
  }
};

export const getNotifications = (): AppNotification[] => readNotificationState().items;

const requireNotificationItems = () => {
  const snapshot = readNotificationState();
  if (snapshot.error) { emitChange(); throw new Error(snapshot.error); }
  return snapshot.items;
};

export const saveNotifications = (items: AppNotification[]) => {
  requireNotificationItems();
  writeNotifications(normalizeItems(items, true));
};

const createAutomaticDedupeKey = (notification: AddNotificationInput, recipientUserId: string) => [
  recipientUserId,
  notification.kind,
  notification.title.trim().toLocaleLowerCase("ru-RU"),
  notification.body.trim().toLocaleLowerCase("ru-RU"),
  normalizeHref(notification.href),
].join("|");

export const addNotification = (notification: AddNotificationInput) => {
  const recipientUserId = notification.recipientUserId?.trim()
    || (notification.recipientRole ? ROLE_RECIPIENTS[notification.recipientRole] : "");
  const title = notification.title.trim();
  if (!recipientUserId || !title || !isNotificationKind(notification.kind)) return null;

  const items = requireNotificationItems();
  const now = new Date();
  const explicitDedupeKey = notification.dedupeKey?.trim();
  const dedupeKey = explicitDedupeKey || createAutomaticDedupeKey(notification, recipientUserId);
  const duplicate = items.find((item) => {
    if (item.recipientUserId !== recipientUserId) return false;
    if (explicitDedupeKey) return item.dedupeKey === explicitDedupeKey;
    const itemKey = createAutomaticDedupeKey(item, item.recipientUserId);
    return itemKey === dedupeKey && now.getTime() - Date.parse(item.createdAt) < AUTO_DEDUPE_WINDOW_MS;
  });

  if (duplicate) return duplicate;

  const created: AppNotification = {
    id: crypto.randomUUID(),
    recipientUserId,
    kind: notification.kind,
    title,
    body: notification.body.trim(),
    href: normalizeHref(notification.href),
    createdAt: now.toISOString(),
    read: false,
    ...(explicitDedupeKey ? { dedupeKey: explicitDedupeKey } : {}),
  };

  saveNotifications([created, ...items]);
  return created;
};

export const subscribeNotifications = (listener: () => void) => {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) listener();
  };

  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
};
