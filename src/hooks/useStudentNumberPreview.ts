import { useCallback, useEffect, useState } from "react";
import { accountService } from "../data/accountStore";
import type { StudentNumberPreview } from "../domain/studentRecord";

export const useStudentNumberPreview = (enabled: boolean, campus: number, actorId: string, actorRevision: number) => {
  const [request, setRequest] = useState(0);
  const [state, setState] = useState<{ preview: StudentNumberPreview | null; error: string; loading: boolean }>({ preview: null, error: "", loading: false });
  useEffect(() => {
    if (!enabled || !campus) { setState({ preview: null, error: "", loading: false }); return; }
    let current = true;
    setState({ preview: null, error: "", loading: true });
    const load = async () => {
      try { const preview = await accountService.previewStudentNumber({ campus, actorId, actorRevision }); if (current) setState({ preview, error: "", loading: false }); }
      catch (error) { console.error("Не удалось показать номер зачетки:", error); if (current) setState({ preview: null, loading: false, error: error instanceof Error ? error.message : "Не удалось получить номер зачетки." }); }
    };
    void load();
    return () => { current = false; };
  }, [enabled, campus, actorId, actorRevision, request]);
  return { ...state, refresh: useCallback(() => setRequest((value) => value + 1), []) };
};
