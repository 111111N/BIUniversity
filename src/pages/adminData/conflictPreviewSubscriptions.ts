interface Environment { window: Pick<EventTarget, "addEventListener" | "removeEventListener">; document: Pick<EventTarget, "addEventListener" | "removeEventListener"> }
const LOCAL_EVENTS = ["bi-university-accounts-change", "bi-university-assignments-change", "bi-university-group-catalog-change", "bi-university-subject-catalog-change", "bi-university-journal-change", "bi-university-managed-schedule-change", "bi-university-materials-change", "bi-university-notifications-change", "bi-university-messages-change", "bi-university-planner-change"];
export const subscribeConflictPreviewChanges = (check: () => void, environment: Environment = { window, document }) => {
  for (const event of ["storage", "focus", ...LOCAL_EVENTS]) environment.window.addEventListener(event, check);
  environment.document.addEventListener("visibilitychange", check);
  return () => {
    for (const event of ["storage", "focus", ...LOCAL_EVENTS]) environment.window.removeEventListener(event, check);
    environment.document.removeEventListener("visibilitychange", check);
  };
};
