import { useId, useRef, useState } from "react";
import type { UserRole } from "../../domain/accounts";
import type { AssessmentAttempt, AssessmentCommandContext, AssessmentCorrection, AssessmentSnapshot } from "../../domain/assessmentTypes";
import { sameAssessmentResults } from "../../domain/assessmentCorrections";
import { assessmentService } from "../../data/assessmentStore";
import ConfirmDialog from "../../components/ConfirmDialog";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { assessmentContext, assessmentContextChanged } from "./model";
import StatementExportButton from "./StatementExportButton";
import styles from "./index.module.scss";

interface Props { actorId: string; role: UserRole; assessmentId: string; attempt: AssessmentAttempt; snapshot: AssessmentSnapshot; blocked: boolean; onEdit(correction: AssessmentCorrection): void; onSaved(message: string): void }
export default function AttemptCorrections({ actorId, role, assessmentId, attempt, snapshot, blocked, onEdit, onSaved }: Props) {
  const [dialog, setDialog] = useState<{ type: "open" | "publish"; context: AssessmentCommandContext; correctionId?: string } | null>(null);
  const [reason, setReason] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const pending = useRef(false); const id = useId();
  const correction = snapshot.corrections?.find((entry) => entry.attemptId === attempt.id);
  const versions = snapshot.correctionPublications?.filter((entry) => entry.attemptId === attempt.id) ?? [];
  const stale = dialog ? assessmentContextChanged(dialog.context, snapshot, actorId) : false;
  const publishable = Boolean(correction && correction.results.every((row) => row.outcome !== null) && !sameAssessmentResults(correction.results, attempt.results));
  useUnsavedChangesWarning(busy || Boolean(dialog?.type === "open" && reason.trim()));
  const confirm = async () => {
    if (!dialog || blocked || stale || pending.current || dialog.type === "publish" && (!publishable || correction?.id !== dialog.correctionId)) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const common = { ...dialog.context, assessmentId, attemptId: attempt.id };
      await assessmentService.execute(dialog.type === "open" ? { ...common, type: "open-correction", reason: reason.trim() } : { ...common, type: "publish-correction", correctionId: dialog.correctionId! });
      setDialog(null); setReason(""); onSaved(dialog.type === "open" ? "Исправление разрешено. Назначенный преподаватель может подготовить новую версию." : "Исправленная версия опубликована. Студенты видят обновлённые результаты; прежние версии сохранены.");
    } catch (failure) { console.error("Не удалось выполнить исправление ведомости:", failure); setError(failure instanceof Error ? failure.message : "Не удалось выполнить действие. Повторите попытку."); }
    finally { pending.current = false; setBusy(false); }
  };
  if (role === "student" || role === "teacher" && attempt.teacherId !== actorId) return null;
  return <>
    {role === "configurator" && !correction && <div className={styles.actions}><button type="button" disabled={blocked || busy} onClick={() => { setDialog({ type: "open", context: assessmentContext(snapshot, actorId) }); setError(""); }}>Разрешить исправление</button></div>}
    {correction && <div className={styles.warning}><p>Подготовка версии {correction.version}. Причина: {correction.reason}</p><p className={styles.note}>До публикации исправления студенты видят прежние результаты.</p>
      {role === "teacher" && attempt.teacherId === actorId && <div className={styles.actions}><button type="button" disabled={blocked || busy} onClick={() => onEdit(correction)}>Исправить результаты</button><button type="button" className={styles.primary} disabled={blocked || busy || !publishable} onClick={() => { setDialog({ type: "publish", correctionId: correction.id, context: assessmentContext(snapshot, actorId) }); setError(""); }}>Опубликовать исправление</button></div>}
    </div>}
    {versions.length > 0 && <details className={styles.disclosure}><summary>Опубликованные версии ({versions.length + 1})</summary><p className={styles.note}>Версия 1 — первоначальная ведомость. Дата сдачи и номер попытки не меняются при исправлении.</p><div className={styles.actions}><span>Версия 1</span><StatementExportButton actorId={actorId} assessmentId={assessmentId} attemptId={attempt.id} snapshot={snapshot} blocked={blocked} version={1} /></div>{versions.map((version) => <div key={version.id}><p>Версия {version.version} · {new Date(version.publishedAt!).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} (Москва) · {version.reason}</p><StatementExportButton actorId={actorId} assessmentId={assessmentId} attemptId={attempt.id} snapshot={snapshot} blocked={blocked} version={version.version} /></div>)}</details>}
    {dialog && <ConfirmDialog title={dialog.type === "open" ? "Разрешить исправление ведомости?" : "Опубликовать исправленную версию?"} confirmLabel={dialog.type === "open" ? "Разрешить исправление" : "Опубликовать исправление"} busy={busy} confirmDisabled={blocked || stale || (dialog.type === "open" ? reason.trim().length < 2 || reason.trim().length > 500 : !publishable || correction?.id !== dialog.correctionId)} error={error || (stale ? "Данные изменились. Закройте подтверждение и проверьте актуальную ведомость." : "")} onCancel={() => { if (!busy) setDialog(null); }} onConfirm={() => void confirm()}>
      <p>Предыдущая опубликованная версия и её история сохранятся. Исправление не создаёт пересдачу и не меняет назначение.</p>
      {dialog.type === "open" && <label className={styles.field} htmlFor={id}>Причина исправления<input id={id} maxLength={500} value={reason} disabled={busy || blocked || stale} onChange={(event) => { setReason(event.target.value); setError(""); }} /></label>}
    </ConfirmDialog>}
  </>;
}
