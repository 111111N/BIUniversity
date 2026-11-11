import { useMemo, useState } from "react";
import Link from "../../components/ChecksContextLink";
import ConfirmDialog from "../../components/ConfirmDialog";
import Card from "../../components/Card";
import { assessmentService } from "../../data/assessmentStore";
import { assessmentStartsAt, canRecordAssessmentResults } from "../../domain/assessments";
import ProfileLink from "../../components/ProfileLink";
import { ASSESSMENT_KIND_LABELS, ATTEMPT_KIND_LABELS, isSupervisedAssessment, type Assessment, type AssessmentCommandContext, type AssessmentSnapshot } from "../../domain/assessmentTypes";
import type { UserRole } from "../../domain/accounts";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import AssessmentForm from "./AssessmentForm";
import ResultEditor from "./ResultEditor";
import RecordBookEditor from "./RecordBookEditor";
import AttemptResults from "./AttemptResults";
import StatementExportButton from "./StatementExportButton";
import { assessmentContext, assessmentContextChanged, displayDate } from "./model";
import useAssessmentClock from "./useAssessmentClock";
import styles from "./index.module.scss";
import AttemptCancellation from "./AttemptCancellation";
import AttemptAudit from "./AttemptAudit";
import type { AssessmentAttemptKind, AssessmentCorrection } from "../../domain/assessmentTypes";
import AttemptCorrections from "./AttemptCorrections";
import SupervisorChange from "./SupervisorChange";

interface Props { assessment: Assessment; snapshot: AssessmentSnapshot; actorId: string; role: UserRole; blocked: boolean; refresh(): void; onMessage(message: string): void }
export default function AssessmentDetails({ assessment, snapshot, actorId, role, blocked, refresh, onMessage }: Props) {
  const [attemptKind, setAttemptKind] = useState<AssessmentAttemptKind | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<AssessmentCorrection | null>(null);
  const [changingSupervisor, setChangingSupervisor] = useState(false);
  const [editingBook, setEditingBook] = useState(false);
  const [publishing, setPublishing] = useState<{ id: string; context: AssessmentCommandContext } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useUnsavedChangesWarning(busy);
  const now = useAssessmentClock();
  const teacherNames = useMemo(() => new Map(snapshot.teachers.map((teacher) => [teacher.id, teacher.name])), [snapshot.teachers]);
  const teacherName = (id: string) => teacherNames.get(id) ?? `Преподаватель недоступен (ID: ${id})`;
  const teacherProfile = (id: string) => id.startsWith("example-") ? teacherName(id) : <ProfileLink className={styles.profileLink} to={`/teachers/${encodeURIComponent(id)}`}>{teacherName(id)}</ProfileLink>;
  const saved = (message: string) => { setAttemptKind(null); setEditing(null); setCorrecting(null); setEditingBook(false); setManaging(null); setCancelling(null); setChangingSupervisor(false); refresh(); onMessage(message); };
  const managedAttempt = assessment.attempts.find((attempt) => attempt.id === managing);
  const cancelledAttempt = assessment.attempts.find((attempt) => attempt.id === cancelling);
  if (managedAttempt && role === "configurator") return <AssessmentForm actorId={actorId} snapshot={snapshot} assessment={assessment} editingAttempt={managedAttempt} blocked={blocked} onClose={() => setManaging(null)} onSaved={saved} refresh={refresh} />;
  const editedAttempt = assessment.attempts.find((attempt) => attempt.id === editing);
  const correctedAttempt = assessment.attempts.find((attempt) => attempt.id === correcting?.attemptId);
  if (correcting && correctedAttempt && role === "teacher") return <ResultEditor actorId={actorId} snapshot={snapshot} assessment={assessment} attempt={{ ...correctedAttempt, state: "draft", results: correcting.results }} correctionId={correcting.id} blocked={blocked} onClose={() => setCorrecting(null)} onSaved={saved} refresh={refresh} />;
  if (editingBook && role === "configurator") return <RecordBookEditor assessment={assessment} snapshot={snapshot} actorId={actorId} blocked={blocked} onClose={() => setEditingBook(false)} onSaved={saved} refresh={refresh} />;
  if (attemptKind) return <AssessmentForm actorId={actorId} snapshot={snapshot} assessment={assessment} attemptKind={attemptKind} blocked={blocked} onClose={() => setAttemptKind(null)} onSaved={saved} refresh={refresh} />;
  if (editedAttempt) return <ResultEditor actorId={actorId} snapshot={snapshot} assessment={assessment} attempt={editedAttempt} blocked={blocked} onClose={() => setEditing(null)} onSaved={saved} refresh={refresh} />;
  const latest = assessment.attempts.at(-1);
  const canAddRetake = latest?.state === "published" || (latest?.state === "cancelled" && assessment.attempts.some((attempt) => attempt.state === "published"));
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
    <nav className={styles.actions} aria-label="Навигация по аттестациям"><Link className={styles.back} to="/assessments">← К аттестациям</Link></nav>
    <Card as="section" className={styles.detailSummary}><header className={styles.detailHeader}><div><div className={styles.metadata}><span className={styles.kindBadge}>{ASSESSMENT_KIND_LABELS[assessment.kind]}</span><span>{assessment.groupName}</span><span>{assessment.period}</span></div><h2>{assessment.title}</h2>{assessment.subjectName && <p className={styles.note}>{assessment.subjectName}</p>}{assessment.supervisorId && <p className={styles.note}>Научный руководитель: {teacherName(assessment.supervisorId)}</p>}</div>
      {role === "configurator" && <div className={styles.actions}>{isSupervisedAssessment(assessment.kind) && <button type="button" disabled={blocked || !snapshot.manageableSupervisorAssessmentIds?.includes(assessment.id)} title="Замена доступна до первого сохранённого результата по всей аттестации при наличии текущей попытки." onClick={() => setChangingSupervisor(true)}>Заменить руководителя</button>}<button type="button" disabled={blocked || !canAddRetake} onClick={() => setAttemptKind("retake")}>Добавить пересдачу</button><button type="button" disabled={blocked || !canAddRetake} onClick={() => setAttemptKind("commission")}>С комиссией</button></div>}
      {role === "configurator" && latest?.state === "cancelled" && !canAddRetake && <div className={styles.actions}><button type="button" disabled={blocked} onClick={() => setAttemptKind("primary")}>Назначить заново</button></div>}
    </header>
    <dl className={styles.detailFacts}><div><dt>Семестр</dt><dd>{assessment.recordBook?.semester ?? "Не указан"}</dd></div><div><dt>Объём программы</dt><dd>{assessment.recordBook ? `${assessment.recordBook.hours} ч` : "Не указан"}</dd></div><div><dt>Раздел зачётки</dt><dd>{assessment.recordBook ? assessment.recordBook.category === "elective" ? "Факультатив" : "Основная программа" : "Не указан"}</dd></div><div><dt>Попыток</dt><dd>{assessment.attempts.length}</dd></div></dl>
    {role === "configurator" && <div className={styles.actions}><button type="button" disabled={blocked} onClick={() => setEditingBook(true)}>Реквизиты зачётки</button></div>}
    {role === "configurator" && latest?.state === "draft" && <p className={styles.note}>Новая попытка станет доступна после публикации предыдущей ведомости или отмены попытки без результатов. Состав участников каждой попытки выбирается отдельно.</p>}
    </Card>
    <div className={styles.sectionHeader}><h2>История попыток</h2><span className={styles.note}>Всего: {assessment.attempts.length} · сначала последние</span></div>
    {!assessment.attempts.length && <div className={styles.empty}>Опубликованных результатов пока нет.</div>}
    <div className={styles.list}>{[...assessment.attempts].reverse().map((attempt) => {
      const completed = attempt.results.filter((entry) => entry.outcome !== null).length;
      const ownsDraft = role === "teacher" && attempt.teacherId === actorId && attempt.state === "draft";
      const opened = canRecordAssessmentResults(attempt, now);
      const upcoming = attempt.state === "draft" && assessmentStartsAt(attempt) > Date.parse(now);
      const manageable = snapshot.manageableAttemptIds?.includes(attempt.id) === true;
      return <Card as="article" className={styles.card} key={attempt.id}>
        <div className={styles.cardHeader}><div><h3><span className={styles.attemptNumber}>№ {attempt.number}</span>{ATTEMPT_KIND_LABELS[attempt.kind]}</h3></div><span className={attempt.state === "published" ? styles.published : styles.badge}>{attempt.state === "cancelled" ? "Отменено" : attempt.state === "published" ? "Опубликовано" : upcoming ? "Предстоит" : role === "student" ? "Ожидается результат" : "Черновик"}</span></div>
        <dl className={styles.detailFacts}><div><dt>Дата сдачи</dt><dd>{displayDate(attempt.date)}</dd></div><div><dt>Время</dt><dd>{attempt.startsAt} (Москва)</dd></div><div><dt>{isSupervisedAssessment(assessment.kind) ? "Научный руководитель" : "Преподаватель"}</dt><dd>{teacherProfile(attempt.teacherId)}</dd></div><div><dt>Кабинет</dt><dd>{attempt.room || "Не указан"}</dd></div></dl>
        {attempt.chairId && <details className={styles.disclosure}><summary>Состав комиссии</summary><dl className={styles.detailFacts}><div><dt>Председатель</dt><dd>{teacherProfile(attempt.chairId)}</dd></div><div><dt>Члены комиссии</dt><dd>{attempt.memberIds.map((id) => <div key={id}>{teacherProfile(id)}</div>)}</dd></div></dl></details>}
        {attempt.state === "cancelled" && <p className={styles.note}>Попытка отменена. Результаты не выставлялись.{role !== "student" && attempt.cancellation ? ` Причина: ${attempt.cancellation.reason}` : ""}</p>}
        {role === "configurator" && attempt.state === "draft" && <div className={styles.actions}><button type="button" disabled={blocked || !manageable} onClick={() => setManaging(attempt.id)}>Изменить назначение</button><button type="button" disabled={blocked || !manageable} onClick={() => setCancelling(attempt.id)}>Отменить попытку</button><p className={styles.note}>{manageable ? "Доступно до первого сохранённого результата." : "После первого сохранённого результата назначение и отмена закрыты, даже если отметки очищены."}</p></div>}
        {role === "configurator" && <AttemptAudit actorId={actorId} assessmentId={assessment.id} attemptId={attempt.id} snapshot={snapshot} blocked={blocked} teacherName={teacherName} />}
        {role === "student" ? attempt.state === "published" ? <AttemptResults assessment={assessment} attempt={attempt} student /> : attempt.state === "cancelled" ? null : <p className={styles.note}>{upcoming ? "Аттестация назначена. Результат появится после публикации ведомости." : "Ведомость ещё не опубликована."}</p> : <>
          {attempt.state !== "cancelled" && <><div className={styles.sectionHeader}><p className={styles.note}>Участников: {attempt.studentIds.length} · заполнено: {completed}</p>{ownsDraft && <div className={styles.actions}><button type="button" disabled={blocked} onClick={() => setEditing(attempt.id)}>{opened ? "Заполнить ведомость" : "Просмотреть ведомость"}</button><button className={styles.primary} type="button" disabled={blocked || !opened || completed !== attempt.studentIds.length || !completed} onClick={() => { setPublishing({ id: attempt.id, context: assessmentContext(snapshot, actorId) }); setError(""); }}>Опубликовать</button></div>}</div>
          <progress className={styles.completion} max={Math.max(attempt.studentIds.length, 1)} value={completed} aria-label={`Заполнено результатов: ${completed} из ${attempt.studentIds.length}`} /></>}
          {attempt.state === "published" && <div className={styles.actions}><StatementExportButton actorId={actorId} assessmentId={assessment.id} attemptId={attempt.id} snapshot={snapshot} blocked={blocked || busy} /></div>}
          {attempt.state === "published" && <AttemptCorrections actorId={actorId} role={role} assessmentId={assessment.id} attempt={attempt} snapshot={snapshot} blocked={blocked || busy} onEdit={setCorrecting} onSaved={saved} />}
          {ownsDraft && !opened && <p className={styles.note}>Внесение и публикация результатов откроются {displayDate(attempt.date)} в {attempt.startsAt} (Москва).</p>}
          <details className={styles.disclosure}><summary>Участники и результаты ({attempt.studentIds.length})</summary><AttemptResults assessment={assessment} attempt={attempt} /></details>
        </>}
      </Card>;
    })}</div>
    {cancelledAttempt && role === "configurator" && <AttemptCancellation actorId={actorId} assessmentId={assessment.id} attempt={cancelledAttempt} snapshot={snapshot} blocked={blocked} onClose={() => setCancelling(null)} onSaved={() => saved("Попытка отменена. Назначение и история сохранены.")} />}
    {changingSupervisor && role === "configurator" && <SupervisorChange assessment={assessment} actorId={actorId} snapshot={snapshot} blocked={blocked || busy} onClose={() => setChangingSupervisor(false)} onSaved={() => saved("Научный руководитель заменён. Прежние назначения сохранены в истории.")} />}
    {publishing && <ConfirmDialog title="Опубликовать ведомость?" confirmLabel="Опубликовать" busy={busy} confirmDisabled={blocked || publishStale || !confirmed || !canRecordAssessmentResults(confirmed, now)} error={error || (publishStale ? "Данные изменились. Закройте подтверждение и проверьте актуальную ведомость." : "")} onConfirm={() => void publish()} onCancel={() => { if (!busy) setPublishing(null); }}><p>{assessment.title} · {confirmed ? ATTEMPT_KIND_LABELS[confirmed.kind] : "Попытка недоступна"}. Студенты увидят свои результаты.</p><p>После публикации эта попытка станет доступна только для просмотра. История других попыток сохранится.</p></ConfirmDialog>}
  </>;
}
