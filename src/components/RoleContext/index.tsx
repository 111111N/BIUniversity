import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

export type UserRole = "teacher" | "student";

export type AcademicMembership = {
  subjectId: string;
  groupIds: string[];
};

export type CurrentUser = {
  id: string;
  name: string;
  role: UserRole;
  scheduleName?: string; // Краткое имя преподавателя в старых записях расписания без ID.
  memberships: AcademicMembership[];
};

const DEMO_USERS: Record<UserRole, CurrentUser> = {
  teacher: {
    id: "teacher-elena-volkova",
    name: "Елена Волкова",
    role: "teacher",
    scheduleName: "Волкова Е.В.",
    memberships: [
      { subjectId: "theory-of-probability", groupIds: ["112-mko", "113-mko", "211-ivt"] },
      { subjectId: "mathematical-statistics", groupIds: ["112-mko", "311-pmi", "312-pmi"] },
      { subjectId: "data-analysis", groupIds: ["112-mko", "411-bi", "412-bi", "413-bi"] },
      { subjectId: "discrete-mathematics", groupIds: ["112-mko", "111-is", "112-is"] },
    ],
  },
  student: {
    id: "anna-smirnova",
    name: "Анна Смирнова",
    role: "student",
    memberships: [
      { subjectId: "theory-of-probability", groupIds: ["112-mko"] },
      { subjectId: "mathematical-statistics", groupIds: ["112-mko"] },
      { subjectId: "data-analysis", groupIds: ["112-mko"] },
      { subjectId: "discrete-mathematics", groupIds: ["112-mko"] },
    ],
  },
};

type RoleContextValue = {
  role: UserRole;
  currentUser: CurrentUser;
  setRole: Dispatch<SetStateAction<UserRole>>;
  canAccessJournal: (subjectId: string, groupId: string) => boolean;
};

const STORAGE_KEY = "bi-university-demo-role";
const RoleContext = createContext<RoleContextValue | null>(null);

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<UserRole>(() => {
    try {
      const savedRole = window.localStorage.getItem(STORAGE_KEY);
      return savedRole === "student" ? "student" : "teacher";
    } catch {
      return "teacher";
    }
  });

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, role); } catch { /* Переключатель остаётся рабочим в текущей вкладке. */ }
  }, [role]);

  const value = useMemo(() => {
    const currentUser = DEMO_USERS[role];
    return {
      role,
      currentUser,
      setRole,
      canAccessJournal: (subjectId: string, groupId: string) => currentUser.memberships.some(
        (membership) => membership.subjectId === subjectId && membership.groupIds.includes(groupId),
      ),
    };
  }, [role]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
};

export const useRole = () => {
  const context = useContext(RoleContext);
  if (!context) throw new Error("useRole must be used inside RoleProvider");
  return context;
};
