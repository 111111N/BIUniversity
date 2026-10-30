import { useCallback, useEffect, useMemo, useState } from "react";
import { readManagedScheduleState, subscribeManagedSchedule } from "../data/managedScheduleStore";

export default function useManagedScheduleSnapshot() {
  const [snapshot, setSnapshot] = useState(readManagedScheduleState);
  const refresh = useCallback(() => setSnapshot(readManagedScheduleState()), []);
  useEffect(() => {
    const unsubscribe = subscribeManagedSchedule(refresh);
    refresh();
    return unsubscribe;
  }, [refresh]);
  return useMemo(() => ({ ...snapshot, refresh }), [snapshot, refresh]);
}
