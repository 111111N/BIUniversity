import { useCallback, useMemo, useSyncExternalStore } from "react";
import { subscribeTeachingAssignments } from "../data/teachingAssignmentsRead";
import { decodeTeachingAssignments, emptyTeachingAssignments, TEACHING_ASSIGNMENTS_KEY } from "../domain/teachingAssignments";

export default function useTeachingAssignmentsDocument() {
  const read = useCallback(() => { try { return localStorage.getItem(TEACHING_ASSIGNMENTS_KEY); } catch { return "unavailable"; } }, []);
  const raw = useSyncExternalStore(subscribeTeachingAssignments, read);
  return useMemo(() => {
    try { return { document: raw === null ? emptyTeachingAssignments() : decodeTeachingAssignments(raw), error: "" }; }
    catch (error) { console.error("Не удалось проверить назначения по типам занятий:", error); return { document: emptyTeachingAssignments(), error: "Назначения преподавателей недоступны. Изменения приостановлены; история доступна для чтения." }; }
  }, [raw]);
}
