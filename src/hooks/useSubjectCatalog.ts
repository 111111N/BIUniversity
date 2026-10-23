import { useEffect, useState } from "react";
import { readSubjectCatalogState, subscribeSubjectCatalog } from "../data/subjectCatalogStore";

export const useSubjectCatalog = () => {
  const [state, setState] = useState(readSubjectCatalogState);
  useEffect(() => {
    const refresh = () => setState(readSubjectCatalogState());
    const unsubscribe = subscribeSubjectCatalog(refresh);
    refresh();
    return unsubscribe;
  }, []);
  return state;
};

export default useSubjectCatalog;
