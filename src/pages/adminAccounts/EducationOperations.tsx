import { useEffect, useId, useRef, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getStudentGroupId, type AccountDraft, type PortalAccount } from "../../domain/accounts";
import { STUDENT_ENROLLMENT_LABELS } from "../../domain/studentEnrollment";
import type { RegistryGroup } from "../../domain/studentRegistry";
import type { EducationEventDetails } from "../../domain/studentEducationEvent";
import { isGroupActive } from "../../domain/groupCatalog";
import Dropdown from "../../components/Dropdown";
import EducationEventFields, { educationDateLabel } from "../../components/EducationEventFields";
import { RecordEditorActions } from "../../components/RecordEditor";
import { EDUCATION_OPERATIONS, getEducationOperationRestriction, getEducationOperations, type EducationOperation } from "./educationOperationModel";
import styles from "./EducationOperations.module.scss";

interface Props {
  account: PortalAccount; draft: AccountDraft; operation: EducationOperation | null; education: EducationEventDetails; groups: RegistryGroup[];
  busy: boolean; disabled: boolean; stale: boolean; problem: string; lastEventDate?: string;
  onChoose(operation: EducationOperation): void; onGroup(groupId: string): void; onEducation(value: EducationEventDetails): void; onCancel(): void; onSubmit(event: FormEvent): void;
}
export default function EducationOperations({ account, draft, operation, education, groups, busy, disabled, stale, problem, lastEventDate, onChoose, onGroup, onEducation, onCancel, onSubmit }: Props) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const previousOperation = useRef<EducationOperation | null>(null);
  const groupId = getStudentGroupId(account);
  const group = groups.find((entry) => entry.id === groupId);
  const options = getEducationOperations(account);
  const transferGroups = groups.filter((entry) => isGroupActive(entry) && entry.id !== groupId);
  const transferOptions = transferGroups.map((entry) => ({ value: entry.id, label: entry.name }));
  const selectedGroup = getStudentGroupId(draft);
  if (selectedGroup && selectedGroup !== groupId && !transferOptions.some((entry) => entry.value === selectedGroup)) {
    const selected = groups.find((entry) => entry.id === selectedGroup);
    transferOptions.push({ value: selectedGroup, label: selected ? `${selected.name} · В архиве` : "Выбранная группа недоступна" });
  }
  useEffect(() => {
    if (operation) { previousOperation.current = operation; headingRef.current?.focus(); }
    else if (previousOperation.current) {
      (rootRef.current?.querySelector<HTMLButtonElement>(`[data-operation="${previousOperation.current}"]:not(:disabled)`) ?? summaryRef.current)?.focus();
      previousOperation.current = null;
    }
  }, [operation]);
  return <div ref={rootRef} className={styles.workspace}>
    <div className={styles.current} ref={summaryRef} tabIndex={-1} aria-label="Текущее обучение"><dl><div><dt>Текущая группа</dt><dd>{group?.name ?? "Группа недоступна"}</dd></div><div><dt>Состояние обучения</dt><dd>{STUDENT_ENROLLMENT_LABELS[account.enrollmentStatus ?? "studying"]}</dd></div></dl></div>
    {operation ? <form className={styles.form} onSubmit={onSubmit} aria-label={EDUCATION_OPERATIONS[operation].label}>
      <h3 ref={headingRef} tabIndex={-1}>{EDUCATION_OPERATIONS[operation].label}</h3>
      <details key={operation} className={styles.switcher}><summary>Сменить действие</summary><p className={styles.note}>Дата, основание и документ останутся в форме. Новое действие нужно будет проверить перед подтверждением.</p><div className={styles.switchOptions}>{options.filter((value) => value !== operation).map((value) => {
        const restriction = getEducationOperationRestriction(account, value, groups);
        return <div key={value}><button type="button" disabled={disabled || stale || Boolean(restriction)} aria-describedby={restriction ? `${id}-switch-${value}` : undefined} onClick={() => onChoose(value)}>{EDUCATION_OPERATIONS[value].label}</button>{restriction && <p id={`${id}-switch-${value}`} className={styles.note}>{restriction}</p>}</div>;
      })}</div></details>
      {operation === "transfer" ? <>
        <Dropdown label="Новая учебная группа" searchable placeholder="" value={selectedGroup !== groupId ? selectedGroup ?? "" : ""} options={transferOptions} disabled={disabled} onChange={onGroup} />
        {!transferGroups.length && <p className={styles.note}>Других действующих групп нет. <Link to="/admin/groups">Открыть группы</Link></p>}
      </> : <p className={styles.result}>Группа сохраняется: <strong>{group?.name ?? "Недоступна"}</strong>. После применения: <strong>{STUDENT_ENROLLMENT_LABELS[draft.enrollmentStatus ?? "studying"]}</strong>.</p>}
      {lastEventDate && <p className={styles.note}>Последнее событие действует с {educationDateLabel(lastEventDate)}. Новое не может быть раньше него.</p>}
      <EducationEventFields value={education} disabled={disabled} onChange={onEducation} />
      <RecordEditorActions label="Проверить изменения" disabled={disabled || stale || Boolean(problem)} busy={busy} onCancel={onCancel} hint={problem || "Проверьте изменения перед подтверждением. Доступ к кабинету не меняется."} />
    </form> : <>
      {!group && <p id={`${id}-missing-group`} className={styles.note}>Текущая учебная группа недоступна. Проверьте сведения о группе перед изменением обучения.</p>}
      <section className={styles.choices} aria-label="Изменить обучение">{options.map((value) => {
        const restriction = getEducationOperationRestriction(account, value, groups);
        const descriptionId = !group ? `${id}-missing-group` : restriction ? `${id}-${value}-restriction` : undefined;
        return <div key={value}><button type="button" data-operation={value} aria-describedby={descriptionId} disabled={disabled || stale || Boolean(restriction)} onClick={() => onChoose(value)}><strong>{EDUCATION_OPERATIONS[value].label}</strong><span>{EDUCATION_OPERATIONS[value].hint}</span></button>{group && restriction && <p id={`${id}-${value}-restriction`} className={styles.note}>{restriction}</p>}</div>;
      })}</section>
      {(account.enrollmentStatus ?? "studying") !== "studying" && <p className={styles.note}>Для перевода в другую группу сначала возобновите обучение, затем оформите перевод.</p>}
      {group && !isGroupActive(group) && <Link className={styles.related} to={`/admin/groups?group=${encodeURIComponent(group.id)}`}>Открыть архивную группу</Link>}
      {!group && <Link className={styles.related} to="/admin/groups">Проверить учебные группы</Link>}
    </>}
  </div>;
}
