import { useContext, useEffect, useRef, useState } from "react";
import type { BackupInspection } from "../../data/localBackupInspectionService";
import { backupConflictPreviewService } from "../../data/localBackupConflictPreviewService";
import type { PeriodSelectionReview as Review } from "../../domain/backupPeriodSelection";
import { ConflictChoiceContext, ConflictPreviewContext } from "./ConflictPreviewContext";
import { subscribeConflictPreviewChanges } from "./conflictPreviewSubscriptions";
import styles from "./index.module.scss";

export default function PeriodSelectionReview({ inspection }: { inspection: BackupInspection }) {
  const choices = useContext(ConflictChoiceContext), active = useContext(ConflictPreviewContext) !== null, operation = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ inspection: BackupInspection; choices: typeof choices; review?: Review; error?: string; busy?: boolean } | null>(null);
  const current = active && state?.inspection === inspection && state.choices === choices ? state : null;
  useEffect(() => () => { operation.current?.abort(); operation.current = null; }, [inspection, choices, active]);
  useEffect(() => {
    if (!active || !current || current.error) return;
    const check = () => { if (!backupConflictPreviewService.isSelectionCurrent({ inspection, actorId: inspection.actor.id, actorRevision: inspection.actor.revision })) { operation.current?.abort(); operation.current = null; setState({ inspection, choices, error: "Данные или доступ изменились. Проверьте файл заново." }); } };
    const stop = subscribeConflictPreviewChanges(check); check(); return stop;
  }, [active, current, inspection, choices]);
  const validate = async () => {
    if (!active || operation.current) return;
    const controller = new AbortController(); operation.current = controller; setState({ inspection, choices, busy: true });
    try { const review = await backupConflictPreviewService.reviewPeriods({ inspection, actorId: inspection.actor.id, actorRevision: inspection.actor.revision, signal: controller.signal }); if (!controller.signal.aborted && operation.current === controller) setState({ inspection, choices, review }); }
    catch (error) { if (!controller.signal.aborted && operation.current === controller) { console.error("Не удалось показать проверку выбранных периодов:", error); setState({ inspection, choices, error: error instanceof Error ? error.message : "Выбранные периоды не проверены." }); } }
    finally { if (operation.current === controller) operation.current = null; }
  };
  return <section aria-label="Проверка выбранных учебных периодов"><p className={styles.hint}>Просмотрите различающиеся годы, семестры и события истории, выберите версии и проверьте их вместе. Записи только из браузера сохраняются; события не переставляются и не перенумеровываются.</p><div className={styles.actions}><button type="button" disabled={!active || current?.busy} onClick={() => void validate()}>{current?.busy ? "Проверяем периоды…" : "Проверить выбранные периоды"}</button></div>
    {current?.error && <p className={styles.error} role="alert">{current.error}</p>}
    {current?.review && <div role="status" aria-live="polite"><p>{current.review.status === "consistent" ? "Карточки учебных периодов согласованы с выбранной историей и её глобальными позициями." : "Выбранные учебные периоды требуют согласования."}</p>{current.review.issues.map(issue => <p key={issue.code}>{issue.message}</p>)}<p className={styles.hint}>Конфликтов: {current.review.counts.conflicts}. Без выбора: {current.review.counts.unresolved}. Записей только из браузера: {current.review.counts.browserOnly}.</p>{current.review.records && <p className={styles.hint}>Учебных лет: {current.review.records.years}. Семестров: {current.review.records.terms}. Событий истории: {current.review.records.history}. Ревизия проверяемого набора: {current.review.revisions.candidate}.</p>}<p className={styles.hint}>Связи ведомостей проверяются в разделе выбранных аттестаций с учётом этого выбора периодов. Полномочия авторов, планы и календари групп требуют общей проверки; восстановление данных не выполнялось.</p></div>}
  </section>;
}
