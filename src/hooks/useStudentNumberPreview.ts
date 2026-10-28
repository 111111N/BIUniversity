import { useCallback, useEffect, useState } from "react";
import { accountService } from "../data/accountStore";
import { getStudentNumberRequestKey, selectStudentNumberRequest, type StudentNumberRequestState } from "./studentNumberRequestState";

export const useStudentNumberPreview = (enabled: boolean, campus: number, actorId: string, actorRevision: number, scope = "") => {
  const [request, setRequest] = useState(0);
  const [state, setState] = useState<StudentNumberRequestState>({ key: null, preview: null, error: "", loading: false });
  const key = getStudentNumberRequestKey(enabled, campus, actorId, actorRevision, scope, request);
  useEffect(() => {
    if (!key) { setState({ key, preview: null, error: "", loading: false }); return; }
    let current = true;
    setState({ key, preview: null, error: "", loading: true });
    const load = async () => {
      try { const preview = await accountService.previewStudentNumber({ campus, actorId, actorRevision }); if (current) setState({ key, preview, error: "", loading: false }); }
      catch (error) { console.error("Не удалось показать номер зачетки:", error); if (current) setState({ key, preview: null, loading: false, error: error instanceof Error ? error.message : "Не удалось получить номер зачетки." }); }
    };
    void load();
    return () => { current = false; };
  }, [key, campus, actorId, actorRevision]);
  const visible = selectStudentNumberRequest(state, key);
  return { preview: visible.preview, error: visible.error, loading: visible.loading, refresh: useCallback(() => setRequest((value) => value + 1), []) };
};
