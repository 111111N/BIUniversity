import { decodeTeachingAssignments, emptyTeachingAssignments, TEACHING_ASSIGNMENTS_KEY } from "../domain/teachingAssignments";

export const TEACHING_ASSIGNMENTS_CHANGE_EVENT = "bi-university-teaching-assignments-change";
export const readTeachingAssignmentsDocument = () => {
  const raw = localStorage.getItem(TEACHING_ASSIGNMENTS_KEY);
  return raw === null ? emptyTeachingAssignments() : decodeTeachingAssignments(raw);
};
export const subscribeTeachingAssignments = (listener: () => void) => {
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === TEACHING_ASSIGNMENTS_KEY) listener(); };
  window.addEventListener("storage", storage); window.addEventListener(TEACHING_ASSIGNMENTS_CHANGE_EVENT, listener);
  return () => { window.removeEventListener("storage", storage); window.removeEventListener(TEACHING_ASSIGNMENTS_CHANGE_EVENT, listener); };
};
