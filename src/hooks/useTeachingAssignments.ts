import { useCallback, useEffect, useRef, useState } from "react";
import { teachingAssignmentsService, type TeachingAssignmentsSnapshot } from "../data/teachingAssignmentsStore";

export default function useTeachingAssignments(actorId: string) {
  const [source, setSource] = useState<{ actorId: string; snapshot?: TeachingAssignmentsSnapshot; loading: boolean; error: string }>({ actorId, loading: true, error: "" });
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const refresh = useCallback(() => {
    const request = ++generation.current;
    setSource(previous => previous.actorId === actorId ? { ...previous, loading: true } : { actorId, loading: true, error: "" });
    void teachingAssignmentsService.read(actorId).then(snapshot => { if (generation.current === request) setSource({ actorId, snapshot, loading: false, error: "" }); })
      .catch(error => { console.error("Не удалось обновить назначения преподавателей:", error); if (generation.current === request) setSource({ actorId, loading: false, error: error instanceof Error ? error.message : "Назначения недоступны." }); });
  }, [actorId]);
  useEffect(() => { refresh(); const stop = teachingAssignmentsService.subscribe(refresh); return () => { invalidate(); stop(); }; }, [refresh, invalidate]);
  return { ...(source.actorId === actorId ? source : { actorId, loading: true, error: "" }), refresh };
}
