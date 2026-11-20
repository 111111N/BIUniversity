import { useCallback, useEffect, useRef, useState } from "react";
import { roomsService, type RoomsSnapshot } from "../data/roomsStore";

export default function useRooms(actorId: string) {
  const [source, setSource] = useState<{ actorId: string; snapshot?: RoomsSnapshot; loading: boolean; error: string }>({ actorId, loading: true, error: "" });
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const refresh = useCallback(() => {
    const request = ++generation.current;
    setSource(previous => previous.actorId === actorId ? { ...previous, loading: true } : { actorId, loading: true, error: "" });
    void roomsService.read(actorId).then(snapshot => { if (generation.current === request) setSource({ actorId, snapshot, loading: false, error: "" }); })
      .catch(error => { console.error("Не удалось обновить аудитории:", error); if (generation.current === request) setSource({ actorId, loading: false, error: error instanceof Error ? error.message : "Аудитории недоступны." }); });
  }, [actorId]);
  useEffect(() => { refresh(); const stop = roomsService.subscribe(refresh); return () => { invalidate(); stop(); }; }, [refresh, invalidate]);
  return { ...(source.actorId === actorId ? source : { actorId, loading: true, error: "" }), refresh };
}
