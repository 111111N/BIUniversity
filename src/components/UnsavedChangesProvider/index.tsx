import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBlocker, type BlockerFunction } from "react-router-dom";
import { createUnsavedChangesRegistry, type UnsavedNavigationCheck } from "../../domain/unsavedNavigation";
import ConfirmDialog from "../ConfirmDialog";

interface UnsavedChangesContextValue {
  register(check: UnsavedNavigationCheck, blockAction?: boolean): () => void;
  requestAction(action: () => void): void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export const UnsavedChangesProvider = ({ children }: { children: ReactNode }) => {
  const [registry] = useState(createUnsavedChangesRegistry);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [actionError, setActionError] = useState("");
  const allowNavigation = useRef(false);
  const shouldBlock = useCallback<BlockerFunction>((transition) => !allowNavigation.current && registry.shouldBlock(transition), [registry]);
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!registry.hasChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [registry]);

  const runAction = useCallback((action: () => void) => {
    try {
      // A confirmed role switch must complete its navigation without a second prompt.
      allowNavigation.current = true;
      action();
      setPendingAction(null);
      setActionError("");
    } catch (error) {
      console.error("Не удалось выполнить переход после подтверждения несохранённых изменений:", error);
      setActionError("Не удалось выполнить переход. Изменения остались в форме — повторите попытку.");
    } finally { allowNavigation.current = false; }
  }, []);

  const requestAction = useCallback((action: () => void) => {
    if (blocker.state !== "unblocked") return;
    setActionError("");
    if (registry.blocksAction()) setPendingAction(() => action);
    else runAction(action);
  }, [blocker.state, registry, runAction]);
  const value = useMemo(() => ({ register: registry.register, requestAction }), [registry, requestAction]);
  const cancel = () => {
    if (blocker.state === "blocked") blocker.reset();
    setPendingAction(null);
    setActionError("");
  };
  const confirm = () => {
    if (blocker.state === "blocked") {
      setPendingAction(null);
      setActionError("");
      blocker.proceed();
    } else if (pendingAction) runAction(pendingAction);
  };

  return <UnsavedChangesContext.Provider value={value}>
    {children}
    {(blocker.state === "blocked" || pendingAction) && <ConfirmDialog title="Уйти без сохранения?" confirmLabel="Уйти без сохранения" cancelLabel="Продолжить редактирование" error={actionError} onConfirm={confirm} onCancel={cancel}>
      <p>В открытой форме есть несохранённые изменения или выбранные файлы. При переходе они могут быть потеряны.</p>
      <p>Уже сохранённые черновики останутся доступными.</p>
    </ConfirmDialog>}
  </UnsavedChangesContext.Provider>;
};

export const useUnsavedChangesGuard = () => {
  const context = useContext(UnsavedChangesContext);
  if (!context) throw new Error("useUnsavedChangesGuard must be used inside UnsavedChangesProvider");
  return context;
};
