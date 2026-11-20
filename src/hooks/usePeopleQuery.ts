import { useCallback, useEffect, useRef, useState } from "react";
import { accountService, subscribeAccounts, type PeopleSnapshot } from "../data/accountStore";

export default function usePeopleQuery(actorId: string, query: string, page: number, personId?: string) {
  const requestKey = JSON.stringify([actorId, query, page, personId ?? null]);
  const [state, setState] = useState<{ requestKey: string; snapshot?: PeopleSnapshot; loading: boolean; error: string }>({ requestKey: "", loading: true, error: "" });
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const refresh = useCallback(() => {
    const request = ++generation.current;
    setState({ requestKey, loading: true, error: "" });
    void accountService.listPeople({ actorId, query: { query, page, ...(personId ? { personId } : {}) } }).then(snapshot => {
      if (request === generation.current) setState({ requestKey, snapshot, loading: false, error: "" });
    }).catch(error => {
      console.error("Не удалось обновить список людей:", error);
      if (request === generation.current) setState({ requestKey, loading: false, error: error instanceof Error ? error.message : "Не удалось прочитать реестр людей." });
    });
  }, [actorId, query, page, personId, requestKey]);
  useEffect(() => {
    refresh(); const stop = subscribeAccounts(refresh);
    return () => { invalidate(); stop(); };
  }, [refresh, invalidate]);
  return { ...(state.requestKey === requestKey ? state : { snapshot: undefined, loading: true, error: "" }), refresh };
}
