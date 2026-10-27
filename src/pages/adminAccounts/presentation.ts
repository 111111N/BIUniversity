import type { AccountChange, UserRole } from "../../domain/accounts";

export const getAccountHistoryPage = (entries: AccountChange[], requestedPage: string | null) => {
  const pages = Math.max(1, Math.ceil(entries.length / 20));
  const requested = Number(requestedPage ?? 1);
  const page = Math.min(Number.isSafeInteger(requested) && requested > 0 ? requested : 1, pages);
  const start = (page - 1) * 20;
  return { page, pages, start, entries: entries.slice(start, start + 20) };
};

export type AccountEditorMode = "create" | "details" | "education" | "assignments" | "role" | "access" | "history";
export const getAccountSections = (role: UserRole) => [
  { value: "details", label: "Данные" },
  ...(role === "student" ? [{ value: "education", label: "Обучение" }] : role === "teacher" ? [{ value: "assignments", label: "Назначения" }] : []),
  { value: "access", label: "Доступ" },
  { value: "history", label: "История" },
];
export const resolveAccountEditorMode = (mode: string | null, role: UserRole): Exclude<AccountEditorMode, "create"> => mode === "role" ? "role" : getAccountSections(role).some((section) => section.value === mode) ? mode as Exclude<AccountEditorMode, "create"> : "details";
