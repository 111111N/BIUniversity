import { useId, useState, type FormEvent } from "react";
import Dropdown from "../../components/Dropdown";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { assessmentService } from "../../data/assessmentStore";
import { ASSESSMENT_KIND_LABELS, isSupervisedAssessment, type Assessment, type AssessmentCommandContext, type AssessmentDraft, type AssessmentKind, type AssessmentSnapshot } from "../../domain/assessmentTypes";
import SelectionList from "./SelectionList";
import RecordBookFields, { parseRecordBookDraft, recordBookDraft } from "./RecordBookFields";
import { assessmentContext, assessmentContextChanged, todayDate } from "./model";
import styles from "./index.module.scss";

interface Props { actorId: string; snapshot: AssessmentSnapshot; assessment?: Assessment; attemptKind?: "retake" | "commission"; blocked?: boolean; onClose(): void; onSaved(message: string): void; refresh(): void }
export default function AssessmentForm({ actorId, snapshot, assessment, attemptKind = "retake", blocked = false, onClose, onSaved, refresh }: Props) {
  const [base, setBase] = useState(snapshot);
  const [context, setContext] = useState<AssessmentCommandContext>(() => assessmentContext(snapshot, actorId));
  const [draft, setDraft] = useState<AssessmentDraft>(() => ({ title: "", kind: "exam", subjectId: null, groupId: "", period: "", attempt: { date: todayDate(), startsAt: "", room: "", teacherId: assessment?.supervisorId ?? "", chairId: null, memberIds: [], studentIds: [] } }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bookDraft, setBookDraft] = useState(() => recordBookDraft(null));
  const bookMetadata = parseRecordBookDraft(bookDraft);
  const { requestAction } = useUnsavedChangesGuard();
  const titleId = useId(); const periodId = useId(); const dateId = useId(); const timeId = useId(); const roomId = useId();
  const stale = assessmentContextChanged(context, snapshot, actorId);
  const locked = busy || stale || blocked;
  const supervised = isSupervisedAssessment(assessment?.kind ?? draft.kind);
  const fixedSupervisor = assessment?.supervisorId ?? null;
  const dirty = Boolean(draft.title || draft.period || draft.subjectId || draft.groupId || draft.attempt.teacherId !== (fixedSupervisor ?? "") || draft.attempt.startsAt || draft.attempt.room || draft.attempt.studentIds.length || draft.attempt.memberIds.length || draft.attempt.chairId || draft.kind !== "exam" || draft.attempt.date !== todayDate());
  useUnsavedChangesWarning(dirty || busy || Boolean(bookDraft.semester || bookDraft.hours || bookDraft.category !== "required"));
  const close = () => { if (!busy) requestAction(onClose); };
  const students = assessment ? assessment.roster.map((entry) => ({ id: entry.studentId, name: entry.name, detail: entry.studentNumber ?? "Номер зачётки не указан" }))
    : base.students.filter((entry) => entry.groupId === draft.groupId).map((entry) => ({ id: entry.studentId, name: entry.name, detail: entry.studentNumber ?? "Номер зачётки не указан" }));
  const teachers = base.teachers.map((entry) => ({ value: entry.id, label: entry.name }));
  const patch = (value: Partial<AssessmentDraft>) => { setDraft((previous) => ({ ...previous, ...value })); setError(""); };
  const patchAttempt = (value: Partial<AssessmentDraft["attempt"]>) => { setDraft((previous) => ({ ...previous, attempt: { ...previous.attempt, ...value } })); setError(""); };
  const commission = Boolean(assessment && attemptKind === "commission");
  const requiresSubject = !assessment && ["exam", "pass", "gradedPass"].includes(draft.kind);
  const valid = Boolean((assessment || (draft.title.trim().length >= 2 && draft.period.trim() && base.groups.some((entry) => entry.id === draft.groupId && entry.status !== "archived") && (!requiresSubject || draft.subjectId) && (!draft.subjectId || base.subjects.some((entry) => entry.id === draft.subjectId)))) && draft.attempt.date && draft.attempt.startsAt && draft.attempt.teacherId
    && (!assessment || draft.attempt.room?.trim()) && (draft.attempt.room?.trim().length ?? 0) <= 256
    && base.teachers.some((entry) => entry.id === draft.attempt.teacherId) && draft.attempt.studentIds.length && draft.attempt.studentIds.every((id) => students.some((entry) => entry.id === id))
    && (!commission || (draft.attempt.chairId && draft.attempt.memberIds.length && draft.attempt.memberIds.every((id) => base.teachers.some((entry) => entry.id === id)) && base.teachers.some((entry) => entry.id === draft.attempt.chairId))));
  const review = async () => {
    setBusy(true); setError("");
    try { const latest = await assessmentService.read(actorId); setBase(latest); setContext(assessmentContext(latest, actorId)); refresh(); }
    catch (failure) { console.error("Не удалось перепроверить аттестацию:", failure); setError(failure instanceof Error ? failure.message : "Не удалось обновить данные. Ввод сохранён."); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (locked || !valid || (!assessment && !bookMetadata)) return;
    setBusy(true); setError("");
    try {
      const { room, ...attemptFields } = draft.attempt;
      const attempt = { ...attemptFields, ...(room?.trim() ? { room: room.trim() } : {}) };
      await assessmentService.execute(assessment ? { ...context, type: "add-attempt", assessmentId: assessment.id, kind: attemptKind, draft: { ...attempt, chairId: commission ? draft.attempt.chairId : null, memberIds: commission ? draft.attempt.memberIds : [] } }
        : { ...context, type: "create", draft: { ...draft, attempt, title: draft.title.trim(), period: draft.period.trim(), recordBook: bookMetadata! } });
      onSaved(assessment ? "Новая попытка создана. Преподаватель может заполнить ведомость." : "Аттестация создана. Основная ведомость доступна назначенному преподавателю.");
    } catch (failure) { console.error("Не удалось сохранить аттестацию:", failure); setError(failure instanceof Error ? failure.message : "Не удалось сохранить. Ввод остался в форме."); }
    finally { setBusy(false); }
  };
  return <RecordEditor title={assessment ? commission ? "Комиссионная пересдача" : "Новая пересдача" : "Новая аттестация"} context={assessment ? `${assessment.title} · ${assessment.groupName}` : "Сначала настройте аттестацию, затем проверьте состав ведомости."} dirty={dirty} busy={busy} onClose={close}>
    {stale && <div className={styles.warning} role="alert"><p>Исходные данные изменились. Сохранение приостановлено; введённые значения сохранены.</p><button type="button" disabled={busy} onClick={() => void review()}>Обновить данные для проверки</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <fieldset className={styles.plainFieldset} disabled={locked}>
        {!assessment && <div className={styles.fields}>
          <label className={styles.field} htmlFor={titleId}>Название<input id={titleId} required minLength={2} maxLength={160} value={draft.title} onChange={(event) => patch({ title: event.target.value })} /></label>
          <Dropdown label="Вид аттестации" value={draft.kind} disabled={locked} options={Object.entries(ASSESSMENT_KIND_LABELS).map(([value, label]) => ({ value, label }))} onChange={(kind) => patch({ kind: kind as AssessmentKind })} />
          <Dropdown label="Группа" value={draft.groupId} disabled={locked} options={base.groups.filter((group) => group.status !== "archived").map((entry) => ({ value: entry.id, label: entry.name }))} searchable placeholder="" onChange={(groupId) => { patch({ groupId }); patchAttempt({ studentIds: base.students.filter((entry) => entry.groupId === groupId).map((entry) => entry.studentId) }); }} />
          <Dropdown label={requiresSubject ? "Дисциплина" : "Дисциплина (необязательно)"} value={draft.subjectId ?? ""} disabled={locked} options={[...(!requiresSubject ? [{ value: "", label: "Без дисциплины" }] : []), ...base.subjects.map((entry) => ({ value: entry.id, label: entry.name }))]} searchable placeholder="" onChange={(subjectId) => patch({ subjectId: subjectId || null })} />
          <label className={styles.field} htmlFor={periodId}>Учебный период<input id={periodId} required maxLength={120} value={draft.period} onChange={(event) => patch({ period: event.target.value })} /><small>Учебный год и семестр в принятом у вас формате.</small></label>
        </div>}
        {!assessment && <RecordBookFields value={bookDraft} onChange={setBookDraft} disabled={locked} />}
        <div className={styles.fields}>
          <label className={styles.field} htmlFor={dateId}>Дата сдачи<input id={dateId} required type="date" value={draft.attempt.date} onChange={(event) => patchAttempt({ date: event.target.value })} /></label>
          <label className={styles.field} htmlFor={timeId}>Время (Москва)<input id={timeId} required type="time" value={draft.attempt.startsAt} onChange={(event) => patchAttempt({ startsAt: event.target.value })} /><small>Внесение результатов откроется с этого момента.</small></label>
          <label className={styles.field} htmlFor={roomId}>{assessment ? "Аудитория" : "Аудитория (необязательно)"}<input id={roomId} required={Boolean(assessment)} maxLength={256} value={draft.attempt.room ?? ""} onChange={(event) => patchAttempt({ room: event.target.value })} /></label>
          <Dropdown label={supervised ? "Научный руководитель" : "Преподаватель, заполняющий ведомость"} value={draft.attempt.teacherId} disabled={locked || Boolean(fixedSupervisor)} options={teachers} searchable placeholder="" onChange={(teacherId) => patchAttempt({ teacherId })} />
        </div>
        {fixedSupervisor && <p className={base.teachers.some((entry) => entry.id === fixedSupervisor) ? styles.note : styles.error}>{base.teachers.some((entry) => entry.id === fixedSupervisor) ? "На всех попытках ведомость заполняет закреплённый научный руководитель." : "Закреплённый научный руководитель недоступен. Создание попытки заблокировано; проверьте его учётную запись."}</p>}
        {!assessment && supervised && <p className={styles.note}>Выбранный научный руководитель закрепляется за всеми участниками этой аттестации и заполняет все её попытки. Для студентов с другим руководителем создайте отдельную аттестацию и выберите соответствующих участников.</p>}
        {commission && <section className={styles.commission}><Dropdown label="Председатель комиссии" value={draft.attempt.chairId ?? ""} disabled={locked} options={teachers} searchable placeholder="" onChange={(chairId) => patchAttempt({ chairId, memberIds: draft.attempt.memberIds.filter((id) => id !== chairId) })} /><SelectionList label="Члены комиссии" disabled={locked} options={base.teachers.filter((entry) => entry.id !== draft.attempt.chairId)} value={draft.attempt.memberIds} onChange={(memberIds) => patchAttempt({ memberIds })} /><p className={styles.note}>Результат вносит назначенный преподаватель. Электронное голосование и подписи не используются.</p></section>}
        {(assessment || draft.groupId) && <><p className={styles.note}>{assessment ? "Выберите участников новой попытки из исходной ведомости. Предыдущие результаты сохранятся в истории." : "В ведомость предварительно включены обучающиеся выбранной группы. Проверьте состав перед созданием."}</p><SelectionList label="Участники ведомости" disabled={locked} options={students} value={draft.attempt.studentIds} onChange={(studentIds) => patchAttempt({ studentIds })} /></>}
      </fieldset>
      <RecordEditorActions label={assessment ? "Создать попытку" : "Создать аттестацию"} disabled={locked || !valid || (!assessment && !bookMetadata)} busy={busy} onCancel={close} hint={!valid || (!assessment && !bookMetadata) ? "Заполните обязательные поля, сведения зачётки и выберите участников ведомости." : "Ведомость появится у назначенного преподавателя как черновик."} />
    </form>
  </RecordEditor>;
}
