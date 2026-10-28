import { getStudentNumberYear, type StudentNumberPreview } from "../domain/studentRecord";

export interface StudentNumberRequestState { key: string | null; preview: StudentNumberPreview | null; error: string; loading: boolean }
export const getStudentNumberRequestKey = (enabled: boolean, campus: number, actorId: string, actorRevision: number, scope: string, attempt: number) => enabled && campus ? JSON.stringify([campus, actorId, actorRevision, scope, attempt]) : null;

export function selectStudentNumberRequest(state: StudentNumberRequestState, key: string | null): StudentNumberRequestState {
  if (!key || state.key !== key) return { key, preview: null, error: "", loading: Boolean(key) };
  return state;
}

export function getUsableStudentNumberPreview(state: Pick<StudentNumberRequestState, "preview" | "loading" | "error">, campus: number | undefined, revision: number | undefined, date: string): StudentNumberPreview | null {
  const preview = state.preview;
  return preview && !state.loading && !state.error && preview.campus === campus && preview.revision === revision && preview.year === getStudentNumberYear(date) ? preview : null;
}
