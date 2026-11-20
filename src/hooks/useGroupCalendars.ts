import { useCallback, useEffect, useRef, useState } from "react";
import { groupCalendarsService, type GroupCalendarsSnapshot } from "../data/groupCalendarsStore";

export default function useGroupCalendars(actorId: string) {
  const [source, setSource] = useState<{ actorId: string; snapshot?: GroupCalendarsSnapshot; loading: boolean; error: string }>({ actorId, loading: true, error: "" });
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const refresh = useCallback(() => {
    const request = ++generation.current;
    setSource(previous => previous.actorId === actorId ? { ...previous, loading: true } : { actorId, loading: true, error: "" });
    void groupCalendarsService.read(actorId).then(snapshot => { if (generation.current === request) setSource({ actorId, snapshot, loading: false, error: "" }); })
      .catch(error => { console.error("Не удалось обновить учебные календари:", error); if (generation.current === request) setSource({ actorId, loading: false, error: error instanceof Error ? error.message : "Календари недоступны." }); });
  }, [actorId]);
  useEffect(() => { refresh(); const stop = groupCalendarsService.subscribe(refresh); return () => { invalidate(); stop(); }; }, [refresh, invalidate]);
  return { ...(source.actorId === actorId ? source : { actorId, loading: true, error: "" }), refresh };
}
