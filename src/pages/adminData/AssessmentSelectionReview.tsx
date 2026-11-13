import { useContext, useEffect, useRef, useState } from "react";
import type { BackupInspection } from "../../data/localBackupInspectionService";
import { backupConflictPreviewService } from "../../data/localBackupConflictPreviewService";
import type { AssessmentSelectionReview as Review } from "../../domain/backupAssessmentSelection";
import { ConflictChoiceContext, ConflictPreviewContext } from "./ConflictPreviewContext";
import { subscribeConflictPreviewChanges } from "./conflictPreviewSubscriptions";
import styles from "./index.module.scss";
import AssessmentReferencesReview from "./AssessmentReferencesReview";

export default function AssessmentSelectionReview({ inspection }: { inspection: BackupInspection }) {
  const choices = useContext(ConflictChoiceContext), active = useContext(ConflictPreviewContext) !== null;
  const operation = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ inspection: BackupInspection; choices: typeof choices; review?: Review; error?: string; busy?: boolean } | null>(null);
  const current = active && state?.inspection === inspection && state.choices === choices ? state : null;
  useEffect(() => () => { operation.current?.abort(); operation.current = null; }, [inspection, choices, active]);
  useEffect(() => {
    if (!active || !current || current.error) return;
    const check = () => {
      if (backupConflictPreviewService.isSelectionCurrent({ inspection, actorId: inspection.actor.id, actorRevision: inspection.actor.revision })) return;
      operation.current?.abort(); operation.current = null;
      setState({ inspection, choices, error: "Данные или доступ изменились. Проверьте файл заново." });
    };
    const unsubscribe = subscribeConflictPreviewChanges(check); check(); return unsubscribe;
  }, [active, current, inspection, choices]);
  const validate = async () => {
    if (!active || operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    setState({ inspection, choices, busy: true });
    try {
      const review = await backupConflictPreviewService.reviewAssessments({ inspection, actorId: inspection.actor.id, actorRevision: inspection.actor.revision, signal: controller.signal });
      if (!controller.signal.aborted && operation.current === controller) setState({ inspection, choices, review });
    } catch (error) {
      if (!controller.signal.aborted && operation.current === controller) {
        console.error("Не удалось показать проверку выбранных аттестаций:", error);
        setState({ inspection, choices, error: error instanceof Error ? error.message : "Не удалось проверить выбранные версии. Повторите проверку файла." });
      }
    } finally { if (operation.current === controller) operation.current = null; }
  };
  return <section aria-label="Проверка выбранного набора аттестаций">
    <p className={styles.hint}>Проверьте аттестации, их историю, исправления и ссылки на выбранные учётки, группы и дисциплины. Записи только из браузера сохраняются в проверяемом наборе. Различающиеся ID требуют выбора после просмотра значений.</p>
    <div className={styles.actions}><button type="button" disabled={!active || current?.busy} onClick={() => void validate()}>{current?.busy ? "Проверяем выбранные версии…" : "Проверить выбранные аттестации"}</button></div>
    {current?.error && <p className={styles.error} role="alert">{current.error}</p>}
    {current?.review && <div role="status" aria-live="polite">
      <p>{current.review.status === "consistent" ? "Выбранные аттестации согласованы со своей историей." : "Выбранный набор аттестаций требует проверки."}</p>
      {current.review.issues.map(issue => <p key={issue.code}>{issue.message}</p>)}
      <p className={styles.hint}>Конфликтов: {current.review.counts.conflicts}. Без выбора: {current.review.counts.unresolved}. Записей только из браузера: {current.review.counts.browserOnly}.</p>
      {current.review.records && <p className={styles.hint}>Аттестаций: {current.review.records.assessments}. Событий истории: {current.review.records.history}. Исправлений: {current.review.records.corrections}. Событий исправлений: {current.review.records.correctionHistory}. Ревизия проверяемого набора: {current.review.revisions.candidate}.</p>}
      {current.review.references && <AssessmentReferencesReview review={current.review.references} />}
      <p className={styles.hint}>Исторические полномочия, учебные периоды и связи с остальными выбранными документами требуют подтверждения. Восстановление всего архива остаётся недоступным; данные не изменены.</p>
    </div>}
  </section>;
}
