import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { CurrentUser, PortalAccount, UserRole } from "../../domain/accounts";
import { readAccountsState, subscribeAccounts } from "../../data/accountStore";
import { DEMO_SUBJECTS } from "../../data/academicCatalog";
import { useSubjectCatalog } from "../../hooks/useSubjectCatalog";
import { withCreatedSubjectMemberships } from "../../domain/studentMemberships";
import { isAccountActive } from "../../domain/accounts";
export type { UserRole, CurrentUser, AcademicMembership } from "../../domain/accounts";

type RoleContextValue = {
  role: UserRole;
  currentUser: CurrentUser;
  accounts: PortalAccount[];
  accountError: string;
  refreshAccounts(): void;
  setRole: Dispatch<SetStateAction<UserRole>>;
  selectAccount(id: string): void;
  canAccessJournal(subjectId: string, groupId: string): boolean;
};
const ROLE_KEY = "bi-university-demo-role";
const ACCOUNT_KEY = "bi-university-demo-account";
const RoleContext = createContext<RoleContextValue | null>(null);
const unavailableUser: CurrentUser = { id: "unavailable-account", name: "Учётная запись недоступна", role: "teacher", memberships: [] };
const readSelectedAccount = () => {
  try {
    const state = readAccountsState();
    const saved = localStorage.getItem(ACCOUNT_KEY);
    if (state.error && saved) return saved;
    if (state.accounts.some((account) => account.id === saved)) return saved!;
    const role = localStorage.getItem(ROLE_KEY);
    return state.accounts.find((account) => account.role === role)?.id ?? "teacher-elena-volkova";
  } catch (error) { console.error("Не удалось восстановить демонстрационную учётную запись:", error); return "teacher-elena-volkova"; }
};
export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const catalog = useSubjectCatalog();
  const [state, setState] = useState(readAccountsState);
  const [selectedId, setSelectedId] = useState(readSelectedAccount);
  useEffect(() => subscribeAccounts(() => setState(readAccountsState())), []);
  // A corrupt store never grants configurator access through a seeded fallback.
  const storedUser = state.accounts.find((account) => account.id === selectedId) ?? state.accounts[0] ?? unavailableUser;
  const currentUser = useMemo(() => withCreatedSubjectMemberships(storedUser, state.accounts,
    new Set(catalog.subjects.filter((subject) => storedUser.studentGroupId || !DEMO_SUBJECTS.some((seed) => seed.id === subject.id)).map((subject) => subject.id))), [storedUser, state.accounts, catalog.subjects]);
  const refreshAccounts = useCallback(() => setState(readAccountsState()), []);
  useEffect(() => {
    if (state.error) return;
    try { localStorage.setItem(ACCOUNT_KEY, currentUser.id); localStorage.setItem(ROLE_KEY, currentUser.role); }
    catch (error) { console.error("Не удалось сохранить выбор демонстрационной учётной записи:", error); }
  }, [currentUser.id, currentUser.role, state.error]);
  const selectAccount = useCallback((id: string) => {
    const latest = readAccountsState(); setState(latest);
    if (!latest.error && latest.accounts.some((account) => account.id === id && isAccountActive(account))) setSelectedId(id);
  }, []);
  const setRole: Dispatch<SetStateAction<UserRole>> = useCallback((action) => {
    const nextRole = typeof action === "function" ? action(currentUser.role) : action;
    const next = state.accounts.find((account) => account.role === nextRole);
    if (next) selectAccount(next.id);
  }, [currentUser.role, selectAccount, state.accounts]);
  const value = useMemo(() => ({
    role: currentUser.role, currentUser, accounts: state.accounts, accountError: state.error, refreshAccounts, setRole, selectAccount,
    canAccessJournal: (subjectId: string, groupId: string) => !state.error && isAccountActive(currentUser) && currentUser.role !== "configurator" && currentUser.memberships.some((membership) => membership.subjectId === subjectId && membership.groupIds.includes(groupId)),
  }), [currentUser, state, refreshAccounts, setRole, selectAccount]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
};
export const useRole = () => {
  const context = useContext(RoleContext);
  if (!context) throw new Error("useRole must be used inside RoleProvider");
  return context;
};
