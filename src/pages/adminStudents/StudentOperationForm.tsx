import { useEffect, useRef, useState, type FormEvent } from "react";
import Dropdown from "../../components/Dropdown";
import EducationEventFields from "../../components/EducationEventFields";
import { RecordEditorActions } from "../../components/RecordEditor";
import { isGroupActive } from "../../domain/groupCatalog";
import type { StudentOperationParameters } from "./operationParameters";
import { getStudentOperationBlockReason, getStudentOperationProblems } from "./operationParameters";
import type { RegistryGroup } from "../../domain/studentRegistry";
import type { EducationEventDetails } from "../../domain/studentEducationEvent";
import styles from "./StudentOperationForm.module.scss";

interface Props {
  parameters: StudentOperationParameters; groups: RegistryGroup[]; count: number;
  busy: boolean; unavailable: boolean; actorAvailable: boolean; validationRequest?: number;
  onGroup(value: string): void; onEducation(value: EducationEventDetails): void; onPrepare(): void; onCancel(): void;
}
const focusFirstProblem = (root: HTMLFormElement | null) => {
  const field = root?.querySelector<HTMLElement>('[aria-invalid="true"], button[data-invalid="true"]');
  const disclosure = field?.closest("details");
  if (disclosure) disclosure.open = true;
  field?.focus();
};
export default function StudentOperationForm({ parameters, groups, count, busy, unavailable, actorAvailable, validationRequest = 0, onGroup, onEducation, onPrepare, onCancel }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [groupTouched, setGroupTouched] = useState(false);
  const showErrors = submitted || validationRequest > 0;
  const problems = getStudentOperationProblems(parameters, groups, new Date().toISOString());
  const groupError = showErrors || groupTouched ? problems.find((problem) => problem.field === "targetGroup")?.message : undefined;
  const blockReason = getStudentOperationBlockReason({ busy, unavailable, actorAvailable, count });
  const fieldsDisabled = busy || unavailable || !actorAvailable;
  const activeGroups = groups.filter(isGroupActive);
  const options = activeGroups.map((group) => ({ value: group.id, label: group.name }));
  if (parameters.targetGroupId && !options.some((option) => option.value === parameters.targetGroupId)) {
    const selected = groups.find((group) => group.id === parameters.targetGroupId);
    options.push({ value: parameters.targetGroupId, label: selected ? `${selected.name} · В архиве` : "Выбранная группа недоступна" });
  }
  useEffect(() => {
    if (!validationRequest) return;
    const frame = requestAnimationFrame(() => focusFirstProblem(formRef.current));
    return () => cancelAnimationFrame(frame);
  }, [validationRequest]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (blockReason) return;
    setSubmitted(true);
    if (problems.length) { requestAnimationFrame(() => focusFirstProblem(formRef.current)); return; }
    onPrepare();
  };
  return <form ref={formRef} className={styles.form} aria-label="Параметры массового действия" noValidate onSubmit={submit}>
    {showErrors && problems.length > 0 && <p className={styles.summaryError} role="alert">Проверьте отмеченные поля. Список ещё не проверен, изменения не применены.</p>}
    {parameters.kind === "transfer" && <div onBlur={() => setGroupTouched(true)}>
      <Dropdown searchable label="Новая учебная группа (обязательно)" value={parameters.targetGroupId} options={options} placeholder="" error={groupError} disabled={fieldsDisabled} onChange={(value) => { setGroupTouched(true); onGroup(value); }} />
      {!unavailable && !activeGroups.length && <p className={styles.note}>Действующих групп нет. Сначала создайте или восстановите учебную группу.</p>}
    </div>}
    <EducationEventFields value={parameters.education} onChange={onEducation} disabled={fieldsDisabled} showErrors={showErrors} />
    <p className={styles.note}>{parameters.kind === "transfer" ? "Перевод доступен учащимся. Прежние оценки останутся в прежней группе; дисциплины новой группы определяются её назначениями." : "Уже оформленные записи останутся без изменений. Исправление другого завершённого состояния выполняется отдельно в учётке."}</p>
    <RecordEditorActions label={`Проверить список (${count})`} busyLabel="Проверяем…" disabled={Boolean(blockReason)} busy={busy} onCancel={onCancel} hint={blockReason || "Откроется предпросмотр всего выбранного списка. Применение изменений — отдельный шаг."} />
  </form>;
}
