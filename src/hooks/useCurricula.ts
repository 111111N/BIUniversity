import { useCallback, useEffect, useRef, useState } from "react";
import { curriculaService, type CurriculumSnapshot } from "../data/curriculaStore";

export default function useCurricula(actorId: string) {
  const [source, setSource] = useState<{ actorId: string; snapshot?: CurriculumSnapshot; loading: boolean; error: string }>({ actorId, loading: true, error: "" });
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const refresh = useCallback(() => {
    const request = ++generation.current;
    setSource(previous => previous.actorId === actorId ? { ...previous, loading: true } : { actorId, loading: true, error: "" });
    void curriculaService.read(actorId).then(snapshot => { if (generation.current === request) setSource({ actorId, snapshot, loading: false, error: "" }); })
      .catch(error => {
        console.error("Не удалось обновить учебные планы:", error);
        if (generation.current === request) setSource({ actorId, loading: false, error: error instanceof Error ? error.message : "Учебные планы недоступны." });
      });
  }, [actorId]);
  useEffect(() => { refresh(); const stop = curriculaService.subscribe(refresh); return () => { invalidate(); stop(); }; }, [refresh, invalidate]);
  return { ...(source.actorId === actorId ? source : { actorId, loading: true, error: "" }), refresh };
}
