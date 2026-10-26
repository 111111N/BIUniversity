import { useEffect, useState } from "react";
import { readGroupCatalogState, subscribeGroupCatalog } from "../data/groupCatalogStore";

export const useGroupCatalog = () => {
  const [state, setState] = useState(readGroupCatalogState);
  useEffect(() => {
    const refresh = () => setState(readGroupCatalogState());
    const unsubscribe = subscribeGroupCatalog(refresh);
    refresh(); return unsubscribe;
  }, []);
  return state;
};
