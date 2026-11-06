import { useState } from "react";
import { Link } from "react-router-dom";
import ConfirmDialog from "../../components/ConfirmDialog";
import { assessmentService } from "../../data/assessmentStore";
import { canRecordAssessmentResults } from "../../domain/assessments";
import { ASSESSMENT_KIND_LABELS, ATTEMPT_KIND_LABELS, isSupervisedAssessment, type Assessment, type AssessmentCommandContext, type AssessmentSnapshot } from "../../domain/assessmentTypes";
import type { UserRole } from "../../domain/accounts";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import AssessmentForm from "./AssessmentForm";
import ResultEditor from "./ResultEditor";
import RecordBookEditor from "./RecordBookEditor";
import AttemptResults from "./AttemptResults";
import { assessmentContext, assessmentContextChanged, displayDate } from "./model";
import useAssessmentClock from "./useAssessmentClock";
import styles from "./index.module.scss";

interface Props { assessment: Assessment; snapshot: AssessmentSnapshot; actorId: string; role: UserRole; blocked: boolean; refresh(): void; onMessage(message: string): void }
export default function AssessmentDetails({ assessment, snapshot, actorId, role, blocked, refresh, onMessage }: Props) {
  const [attemptKind, setAttemptKind] = useState<"retake" | "commission" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingBook, setEditingBook] = useState(false);
  const [publishing, setPublishing] = useState<{ id: string; context: AssessmentCommandContext } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useUnsavedChangesWarning(busy);
  const now = useAssessmentClock();
  const teacherName = (id: string) => snapshot.teachers.find((teacher) => teacher.id === id)?.name ?? "Преподаватель недоступен";
  const saved = (message: string) => { setAttemptKind(null); setEditing(null); setEditingBook(false); refresh(); onMessage(message); };
  const editedAttempt = assessment.attempts.find((attempt) => attempt.id === editing);
  if (editingBook && role === "configurator") return <RecordBookEditor assessment={assessment} snapshot={snapshot} actorId={actorId} blocked={blocked} onClose={() => setEditingBook(false)} onSaved={saved} refresh={refresh} />;
  if (attemptKind) return <AssessmentForm actorId={actorId} snapshot={snapshot} assessment={assessment} attemptKind={attemptKind} blocked={blocked} onClose={() => setAttemptKind(null)} onSaved={saved} refresh={refresh} />;
  if (editedAttempt) return <ResultEditor actorId={actorId} snapshot={snapshot} assessment={assessment} attempt={editedAttempt} blocked={blocked} onClose={() => setEditing(null)} onSaved={saved} refresh={refresh} />;
  const latest = assessment.attempts.at(-1);
  const confirmed = assessment.attempts.find((attempt) => attempt.id === publishing?.id);
  const publishStale = Boolean(publishing && assessmentContextChanged(publishing.context, snapshot, actorId));
  const publish = async () => {
    if (!publishing || busy || blocked || publishStale || !confirmed || !canRecordAssessmentResults(confirmed, new Date().toISOString())) return;
    setBusy(true); setError("");
    try { await assessmentService.execute({ ...publishing.context, type: "publish", assessmentId: assessment.id, attemptId: publishing.id }); setPublishing(null); refresh(); onMessage("Ведомость опубликована. Участники видят свои результаты; изменение опубликованной попытки недоступно."); }
    catch (failure) { console.error("Не удалось опубликовать ведомость:", failure); setError(failure instanceof Error ? failure.message : "Не удалось опубликовать ведомость. Повторите попытку."); }
    finally { setBusy(false); }
  };
  return <>
    <header className={styles.detailHeader}><div><Link className={styles.back} to="/assessments">← К аттестациям</Link><p className={styles.note}>{ASSESSMENT_KIND_LABELS[assessment.kind]} · {assessment.groupName} · {assessment.period}</p><h2>{assessment.title}</h2>{assessment.subjectName && <p className={styles.note}>{assessment.subjectName}</p>}{assessment.supervisorId && <p className={styles.note}>Научный руководитель: {teacherName(assessment.supervisorId)}</p>}</div>
      {role === "configurator" && <div className={styles.actions}><button type="button" disabled={blocked || latest?.state !== "published"} onClick={() => setAttemptKind("retake")}>Добавить пересдачу</button><button type="button" disabled={blocked || latest?.state !== "published"} onClick={() => setAttemptKind("commission")}>С комиссией</button></div>}
    </header>
    <div className={styles.sectionHeader}><p className={styles.note}>{assessment.recordBook ? `${assessment.recordBook.semester} семестр · ${assessment.recordBook.hours} ч · ${assessment.recordBook.category === "elective" ? "Факультатив" : "Основная программа"}` : "Семестр и часы для зачётки ещё не указаны"}</p>{role === "configurator" && <div className={styles.actions}><button type="button" disabled={blocked} onClick={() => setEditingBook(true)}>Реквизиты зачётки</button></div>}</div>
    {role === "configurator" && latest?.state !== "published" && <p className={styles.note}>Новая попытка станет доступна после публикации предыдущей ведомости. Состав участников каждой попытки выбирается отдельно.</p>}
    {!assessment.attempts.length && <div className={styles.empty}>Опубликованных результатов пока нет.</div>}
    <div className={styles.list}>{[...assessment.attempts].reverse().map((attempt) => {
      const completed = attempt.results.filter((entry) => entry.outcome !== null).length;
      const ownsDraft = role === "teacher" && attempt.teacherId === actorId && attempt.state === "draft";
      const opened = canRecordAssessmentResults(attempt, now);
      return <article className={styles.card} key={attempt.id}>
        <div className={styles.cardHeader}><div><h3>{ATTEMPT_KIND_LABELS[attempt.kind]} · № {attempt.number}</h3><p>{displayDate(attempt.date)} в {attempt.startsAt} (Москва)</p><p>{isSupervisedAssessment(assessment.kind) ? "Научный руководитель" : "Преподаватель"}: {teacherName(attempt.teacherId)}</p></div><span className={attempt.state === "published" ? styles.published : styles.badge}>{attempt.state === "published" ? "Опубликовано" : "Черновик"}</span></div>
        {attempt.chairId && <details className={styles.disclosure}><summary>Состав комиссии</summary><p>Председатель: {teacherName(attempt.chairId)}</p><p>Члены комиссии: {attempt.memberIds.map(teacherName).join(", ")}</p></details>}
        {role === "student" ? <AttemptResults assessment={assessment} attempt={attempt} student /> : <>
          <div className={styles.sectionHeader}><p className={styles.note}>Участников: {attempt.studentIds.length} · заполнено: {completed}</p>{ownsDraft && <div className={styles.actions}><button type="button" disabled={blocked} onClick={() => setEditing(attempt.id)}>{opened ? "Заполнить ведомость" : "Просмотреть ведомость"}</button><button className={styles.primary} type="button" disabled={blocked || !opened || completed !== attempt.studentIds.length || !completed} onClick={() => { setPublishing({ id: attempt.id, context: assessmentContext(snapshot, actorId) }); setError(""); }}>Опубликовать</button></div>}</div>
          {ownsDraft && !opened && <p className={styles.note}>Внесение и публикация результатов откроются {displayDate(attempt.date)} в {attempt.startsAt} (Москва).</p>}
          <details className={styles.disclosure}><summary>Участники и результаты ({attempt.studentIds.length})</summary><AttemptResults assessment={assessment} attempt={attempt} /></details>
        </>}
        {attempt.state === "published" && <p className={styles.note}>Опубликованная попытка доступна только для просмотра.</p>}
      </article>;
    })}</div>
    {publishing && <ConfirmDialog title="Опубликовать ведомость?" confirmLabel="Опубликовать" busy={busy} confirmDisabled={blocked || publishStale || !confirmed || !canRecordAssessmentResults(confirmed, now)} error={error || (publishStale ? "Данные изменились. Закройте подтверждение и проверьте актуальную ведомость." : "")} onConfirm={() => void publish()} onCancel={() => { if (!busy) setPublishing(null); }}><p>{assessment.title} · {confirmed ? ATTEMPT_KIND_LABELS[confirmed.kind] : "Попытка недоступна"}. Студенты увидят свои результаты.</p><p>После публикации эта попытка станет доступна только для просмотра. История других попыток сохранится.</p></ConfirmDialog>}
  </>;
}
