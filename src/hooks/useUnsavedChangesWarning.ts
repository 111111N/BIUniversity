import { useEffect } from "react";

/** Browser reload/tab-close warning only; internal navigation needs its own guard. */
const useUnsavedChangesWarning = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [enabled]);
};

export default useUnsavedChangesWarning;
