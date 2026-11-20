import { useCallback, useEffect, useRef, useState } from "react";
import { scheduleTemplatesService, type ScheduleTemplatesSnapshot } from "../data/scheduleTemplatesStore";
export default function useScheduleTemplates(actorId: string) {
  const [source, setSource] = useState<{ actorId: string; snapshot?: ScheduleTemplatesSnapshot; loading: boolean; error: string }>({ actorId, loading: true, error: "" }), generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const refresh = useCallback(() => {
    const token = ++generation.current;
    setSource(previous => previous.actorId === actorId ? { ...previous, loading: true } : { actorId, loading: true, error: "" });
    void scheduleTemplatesService.read(actorId).then(snapshot => { if (generation.current === token) setSource({ actorId, snapshot, loading: false, error: "" }); }).catch(error => { console.error("Не удалось обновить шаблоны расписания:", error); if (generation.current === token) setSource({ actorId, loading: false, error: error instanceof Error ? error.message : "Шаблоны недоступны." }); });
  }, [actorId]);
  useEffect(() => { refresh(); const stop = scheduleTemplatesService.subscribe(refresh); return () => { invalidate(); stop(); }; }, [refresh, invalidate]);
  return { ...(source.actorId === actorId ? source : { actorId, loading: true, error: "" }), refresh };
}
