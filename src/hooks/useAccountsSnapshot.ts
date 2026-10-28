import { useCallback, useEffect, useState } from "react";
import { readAccountsState, subscribeAccounts } from "../data/accountStore";

export default function useAccountsSnapshot() {
  const [snapshot, setSnapshot] = useState(readAccountsState);
  const refresh = useCallback(() => setSnapshot(readAccountsState()), []);
  useEffect(() => {
    const unsubscribe = subscribeAccounts(refresh);
    refresh();
    return unsubscribe;
  }, [refresh]);
  return snapshot;
}
