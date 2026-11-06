import { useCallback, useEffect, useState } from "react";
import { assessmentService } from "../data/assessmentStore";
import type { AssessmentSnapshot } from "../domain/assessmentTypes";

interface ReadState { actorId: string; revision: number; snapshot: AssessmentSnapshot | null; loading: boolean; error: string }

export const useAssessments = (actorId: string) => {
  const [state, setState] = useState<ReadState>({ actorId, revision: 0, snapshot: null, loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => assessmentService.subscribe(refresh), [refresh]);
  useEffect(() => {
    let active = true;
    void assessmentService.read(actorId).then((snapshot) => {
      if (active) setState({ actorId, revision, snapshot, loading: false, error: "" });
    }, (error: unknown) => {
      if (active) setState((previous) => ({ actorId, revision, snapshot: previous.actorId === actorId ? previous.snapshot : null, loading: false, error: error instanceof Error ? error.message : "Не удалось загрузить аттестации." }));
    });
    return () => { active = false; };
  }, [actorId, revision]);
  // A role/account switch must never render a snapshot from the previous identity, even for one frame.
  // Refreshes keep the editor mounted; loading/error make its retained snapshot read-only until revalidated.
  return state.actorId === actorId ? { snapshot: state.snapshot, loading: state.loading || state.revision !== revision, error: state.revision === revision ? state.error : "", refresh }
    : { snapshot: null, loading: true, error: "", refresh };
};
