import { useId, useRef, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Dropdown from "../../components/Dropdown";
import { assessmentService } from "../../data/assessmentStore";
import type { Assessment, AssessmentSnapshot } from "../../domain/assessmentTypes";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { assessmentContext, assessmentContextChanged } from "./model";
import styles from "./index.module.scss";

interface Props { assessment: Assessment; actorId: string; snapshot: AssessmentSnapshot; blocked: boolean; onClose(): void; onSaved(): void }
export default function SupervisorChange({ assessment, actorId, snapshot, blocked, onClose, onSaved }: Props) {
  const [context] = useState(() => assessmentContext(snapshot, actorId));
  const [teacherId, setTeacherId] = useState(""); const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const pending = useRef(false); const id = useId();
  const stale = assessmentContextChanged(context, snapshot, actorId);
  const available = snapshot.manageableSupervisorAssessmentIds?.includes(assessment.id) === true;
  const options = snapshot.teachers.filter((teacher) => teacher.id !== assessment.supervisorId).map((teacher) => ({ value: teacher.id, label: teacher.name }));
  const selected = options.some((teacher) => teacher.value === teacherId);
  const validReason = reason.trim().length >= 2 && reason.trim().length <= 500;
  const locked = busy || blocked || stale || !available;
  useUnsavedChangesWarning(busy || Boolean(teacherId || reason.trim()));
  const save = async () => {
    if (pending.current || locked || !selected || !validReason) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await assessmentService.execute({ ...context, type: "change-supervisor", assessmentId: assessment.id, teacherId, reason: reason.trim() });
      onSaved();
    } catch (failure) { console.error("Не удалось заменить научного руководителя:", failure); setError(failure instanceof Error ? failure.message : "Не удалось заменить руководителя. Выбор и причина сохранены в форме."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <ConfirmDialog title="Заменить научного руководителя?" confirmLabel="Заменить руководителя" busy={busy} confirmDisabled={locked || !selected || !validReason} error={error || (stale ? "Данные изменились. Выбор сохранён; закройте подтверждение и проверьте актуальную аттестацию." : !available ? "Замена больше недоступна. Для неё нужна текущая попытка без ранее сохранённых результатов по всей аттестации." : "")} onCancel={() => { if (!busy) onClose(); }} onConfirm={() => void save()}>
    <p>{assessment.title}. Назначение текущей попытки изменится; прежние назначения и отменённые попытки сохранятся в истории.</p>
    <Dropdown label="Новый научный руководитель" value={teacherId} options={options} onChange={(value) => { setTeacherId(value); setError(""); }} searchable placeholder="" disabled={locked} />
    {!options.length && <p className={styles.note}>Нет других действующих преподавателей. Проверьте учётные записи преподавателей.</p>}
    <label className={styles.field} htmlFor={id}>Причина замены<input id={id} maxLength={500} value={reason} disabled={locked} onChange={(event) => { setReason(event.target.value); setError(""); }} /></label>
  </ConfirmDialog>;
}
