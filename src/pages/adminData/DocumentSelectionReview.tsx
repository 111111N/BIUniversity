import { useContext, useEffect, useRef, useState } from "react";
import type { BackupInspection } from "../../data/localBackupInspectionService";
import { backupConflictPreviewService } from "../../data/localBackupConflictPreviewService";
import { ConflictChoiceContext, ConflictPreviewContext } from "./ConflictPreviewContext";
import { subscribeConflictPreviewChanges } from "./conflictPreviewSubscriptions";
import styles from "./index.module.scss";
import SelectedDependenciesReview from "./SelectedDependenciesReview";
import BaseSourcesReview from "./BaseSourcesReview";
import AssessmentStructureSummary from "./AssessmentStructureSummary";
import { BACKUP_ASSESSMENT_DOCUMENTS } from "../../domain/backupAssessmentDocuments";
import ListSourcesReview from "./ListSourcesReview";

type Review = Awaited<ReturnType<typeof backupConflictPreviewService.reviewDocuments>>;
export default function DocumentSelectionReview({ inspection }: { inspection: BackupInspection }) {
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
    try { const review = await backupConflictPreviewService.reviewDocuments({ inspection, actorId: inspection.actor.id, actorRevision: inspection.actor.revision, signal: controller.signal }); if (!controller.signal.aborted && operation.current === controller) setState({ inspection, choices, review }); }
    catch (error) { if (!controller.signal.aborted && operation.current === controller) { console.error("Не удалось показать проверку выбранных справочников:", error); setState({ inspection, choices, error: error instanceof Error ? error.message : "Выбранные справочники не проверены." }); } }
    finally { if (operation.current === controller) operation.current = null; }
  };
  return <section aria-label="Согласованность выбранных данных"><h2>Проверка выбранных данных</h2><p className={styles.hint}>Проверьте выбранные справочники, ведомости, списки и настройки интерфейса. Записи только из одного источника сохраняются; все поддерживаемые конфликты требуют выбора после просмотра.</p><div className={styles.actions}><button type="button" disabled={!active || current?.busy} onClick={() => void validate()}>{current?.busy ? "Проверяем выбранные данные…" : "Проверить выбранные данные"}</button></div>
    {current?.error && <p className={styles.error} role="alert">{current.error}</p>}
    {current?.review && <div role="status" aria-live="polite"><p>{current.review.status === "absent" ? "Поддерживаемые документы отсутствуют в обоих источниках." : current.review.status === "consistent" ? "Поддерживаемые выбранные источники проверены. Зависимости показаны отдельно." : "Выбранные карточки и история требуют согласования."}</p><BaseSourcesReview reviews={current.review.baseSources} /><ListSourcesReview key={current.review.references.checkedAt} reviews={current.review.listSources} /><ListSourcesReview key={`preferences:${current.review.references.checkedAt}`} reviews={current.review.preferenceSources} settings title="Настройки интерфейса" />{current.review.documents.map(document => <article className={styles.notice} key={document.key}><h3>{document.label}</h3><p>{document.status === "absent" ? "Отсутствует в обоих источниках; пустой документ не создавался." : document.status === "consistent" ? "Структура и полная история согласованы." : "Проверка заблокирована."}</p>{document.issues.map(issue => <p key={issue.code}>{issue.message}</p>)}{document.status !== "absent" && <p className={styles.hint}>Конфликтов: {document.counts.conflicts}. Без выбора: {document.counts.unresolved}. Записей только из браузера: {document.counts.browserOnly}.{document.revisions.candidate !== undefined ? ` Ревизия проверяемого набора: ${document.revisions.candidate}.` : ""}</p>}</article>)}<article className={styles.notice}><h3>{BACKUP_ASSESSMENT_DOCUMENTS.assessments.label}</h3><AssessmentStructureSummary review={current.review.assessmentSource} /></article><SelectedDependenciesReview key={current.review.references.checkedAt} review={current.review.references} /><p className={styles.hint}>Исторические полномочия, оставшиеся зависимости и согласование базового расписания требуют общей проверки. Расходящиеся ветви не сливаются и события не перенумеровываются. Восстановление и изменение хранилищ не выполнялись.</p></div>}
  </section>;
}
