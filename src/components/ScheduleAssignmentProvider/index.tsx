import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { createScheduleAssignmentHandoff } from "../../domain/scheduleAssignmentHandoff";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";

type Store = ReturnType<typeof createScheduleAssignmentHandoff>;
const Context = createContext<{ store: Store; pending: ReturnType<Store["getSnapshot"]> } | null>(null);

export default function ScheduleAssignmentProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createScheduleAssignmentHandoff);
  const pending = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const location = useLocation();
  useUnsavedChangesWarning(Boolean(pending), store.shouldBlock);
  useEffect(() => {
    if (pending && !store.matchesSchedule(location) && !store.matchesSubjects(location)) store.clear();
  }, [location, pending, store]);
  const value = useMemo(() => ({ store, pending }), [store, pending]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useScheduleAssignmentHandoff = () => {
  const context = useContext(Context);
  if (!context) throw new Error("ScheduleAssignmentProvider is required");
  return context;
};
