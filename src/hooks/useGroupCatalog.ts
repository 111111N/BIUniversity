import { useCallback, useEffect, useState } from "react";
import { readGroupCatalogState, subscribeGroupCatalog } from "../data/groupCatalogStore";

export const useGroupCatalog = () => {
  const [state, setState] = useState(readGroupCatalogState);
  const refresh = useCallback(() => setState(readGroupCatalogState()), []);
  useEffect(() => {
    const unsubscribe = subscribeGroupCatalog(refresh);
    refresh(); return unsubscribe;
  }, [refresh]);
  return { ...state, refresh };
};
