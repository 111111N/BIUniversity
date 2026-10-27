import { useCallback, useEffect, useState } from "react";
import { readSubjectCatalogState, subscribeSubjectCatalog } from "../data/subjectCatalogStore";

export const useSubjectCatalog = () => {
  const [state, setState] = useState(readSubjectCatalogState);
  const refresh = useCallback(() => setState(readSubjectCatalogState()), []);
  useEffect(() => {
    const unsubscribe = subscribeSubjectCatalog(refresh);
    refresh();
    return unsubscribe;
  }, [refresh]);
  return { ...state, refresh };
};

export default useSubjectCatalog;
