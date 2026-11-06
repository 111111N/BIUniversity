import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BackupInspection } from "../../data/localBackupInspectionService";
import { backupConflictPreviewService, releaseBackupInspectionPreview, clearBackupConflictChoices, type BackupConflictVersion } from "../../data/localBackupConflictPreviewService";
import { getBackupDifferenceKey, type BackupDifference } from "../../domain/backupComparison";
import type { BackupRecordPreview } from "../../domain/backupRecordPreview";
import { ConflictPreviewContext, ConflictChoiceContext } from "./ConflictPreviewContext";
import ConflictPreviewDialog from "./ConflictPreviewDialog";
import { subscribeConflictPreviewChanges } from "./conflictPreviewSubscriptions";
import styles from "./index.module.scss";

interface State { inspection: BackupInspection; difference: BackupDifference; preview: BackupRecordPreview | null; error: string }
const EMPTY_CHOICES: ReadonlyMap<string, BackupConflictVersion> = new Map();
export default function ConflictPreviewProvider({ inspection, active, children }: { inspection: BackupInspection | null; active: boolean; children: ReactNode }) {
  const operation = useRef<AbortController | null>(null);
  const validationTarget = useRef<BackupDifference | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [choiceState, setChoiceState] = useState<{ inspection: BackupInspection | null; values: ReadonlyMap<string, BackupConflictVersion> }>({ inspection: null, values: EMPTY_CHOICES });
  const choices = active && choiceState.inspection === inspection ? choiceState.values : EMPTY_CHOICES;
  const [choiceNotice, setChoiceNotice] = useState("");
  const close = () => { operation.current?.abort(); operation.current = null; setState(null); };
  useEffect(() => {
    setState(null);
    setChoiceState({ inspection, values: EMPTY_CHOICES }); clearBackupConflictChoices(inspection);
    setChoiceNotice("");
    validationTarget.current = null;
    return () => { operation.current?.abort(); operation.current = null; };
  }, [inspection, active]);
  useEffect(() => () => releaseBackupInspectionPreview(inspection), [inspection]);
  useEffect(() => {
    if (!active || !inspection || (!choices.size && (state?.inspection !== inspection || !state.preview || state.error))) return;
    const target = state?.inspection === inspection ? state.difference : validationTarget.current;
    if (!target) return;
    const check = () => {
      if (!backupConflictPreviewService.isCurrent({ inspection, difference: target, actorId: inspection.actor.id, actorRevision: inspection.actor.revision })) {
        setChoiceState({ inspection, values: EMPTY_CHOICES }); clearBackupConflictChoices(inspection);
        setChoiceNotice("Данные или доступ изменились. Черновик выбора сброшен; проверьте файл заново.");
        setState(current => current?.inspection === inspection ? { ...current, preview: null, error: "Данные или доступ изменились. Значения скрыты; проверьте файл заново." } : current);
      }
    };
    const unsubscribe = subscribeConflictPreviewChanges(check); check(); return unsubscribe;
  }, [inspection, active, state, choices]);
  const open = async (difference: BackupDifference) => {
    if (!inspection || !active || operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    validationTarget.current = difference;
    setState({ inspection, difference, preview: null, error: "" });
    try {
      const preview = await backupConflictPreviewService.preview({ inspection, difference, actorId: inspection.actor.id, actorRevision: inspection.actor.revision, signal: controller.signal });
      if (!controller.signal.aborted && operation.current === controller) setState({ inspection, difference, preview, error: "" });
    } catch (reason) {
      if (!controller.signal.aborted && operation.current === controller) {
        console.error("Не удалось показать версии записи:", reason);
        if (!backupConflictPreviewService.isCurrent({ inspection, difference, actorId: inspection.actor.id, actorRevision: inspection.actor.revision })) {
          setChoiceState({ inspection, values: EMPTY_CHOICES }); clearBackupConflictChoices(inspection); setChoiceNotice("Данные или доступ изменились. Черновик выбора сброшен; проверьте файл заново.");
        }
        setState({ inspection, difference, preview: null, error: reason instanceof Error ? reason.message : "Не удалось открыть сравнение. Проверьте файл заново." });
      }
    } finally { if (operation.current === controller) operation.current = null; }
  };
  const choose = (version: BackupConflictVersion) => {
    if (!inspection || !active || state?.inspection !== inspection || !state.preview || state.error) return;
    try {
      setChoiceState({ inspection, values: backupConflictPreviewService.choose({ inspection, difference: state.difference, actorId: inspection.actor.id, actorRevision: inspection.actor.revision, version }) });
      setChoiceNotice("");
    } catch (reason) {
      setChoiceState({ inspection, values: EMPTY_CHOICES }); clearBackupConflictChoices(inspection);
      setChoiceNotice("Черновик выбора сброшен. Для продолжения проверьте файл заново.");
      setState({ ...state, preview: null, error: reason instanceof Error ? reason.message : "Не удалось сохранить выбор. Проверьте файл заново." });
    }
  };
  return <ConflictPreviewContext.Provider value={inspection && active ? difference => { void open(difference); } : null}><ConflictChoiceContext.Provider value={choices}>
    {active && inspection && (choices.size > 0 || choiceNotice) && <p className={styles.hint} role="status" aria-live="polite">{choiceNotice || `Черновик: выбрано версий записей — ${choices.size}. Данные не изменены.`}</p>}
    {children}
    {state && state.inspection === inspection && active && <ConflictPreviewDialog difference={state.difference} preview={state.preview} error={state.error} choice={choices.get(getBackupDifferenceKey(state.difference))} onChoose={choose} onClose={close} />}
  </ConflictChoiceContext.Provider></ConflictPreviewContext.Provider>;
}
