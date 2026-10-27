import { useEffect, useRef } from "react";
import Dropdown from "../../components/Dropdown";
import { isAccountActive, type PortalAccount } from "../../domain/accounts";
import styles from "./AssignmentTeacher.module.scss";

interface Props {
  teacher?: PortalAccount;
  teachers: PortalAccount[];
  choosing: boolean;
  canChange: boolean;
  disabled: boolean;
  onChoose(id: string): void;
  onStart(): void;
  onCancel(): void;
}

export default function AssignmentTeacher({ teacher, teachers, choosing, canChange, disabled, onChoose, onStart, onCancel }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const previousChoosing = useRef(choosing);
  useEffect(() => {
    if (choosing) rootRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    else if (previousChoosing.current) changeRef.current?.focus();
    previousChoosing.current = choosing;
  }, [choosing]);
  return <div ref={rootRef} className={styles.workspace}>
    {choosing ? <>
      <Dropdown label="Преподаватель дисциплины" searchable placeholder="" value={teacher?.id ?? ""} options={teachers.map((account) => ({ value: account.id, label: `${account.name} · ${account.login}${isAccountActive(account) ? "" : " · заблокирован"}` }))} onChange={onChoose} disabled={disabled} />
      {teacher && <button className={styles.back} type="button" disabled={disabled} onClick={onCancel}>Вернуться к выбранному преподавателю</button>}
    </> : teacher && <div className={styles.identity}>
      <div><span>Преподаватель</span><strong>{teacher.name}</strong><span>{teacher.login}</span>{!isAccountActive(teacher) && <span className={styles.blocked}>Доступ заблокирован</span>}</div>
      {canChange && <button ref={changeRef} type="button" disabled={disabled} onClick={onStart}>Выбрать другого</button>}
    </div>}
    {!teachers.length && <p className={styles.note}>Нет доступных учётных записей преподавателей.</p>}
  </div>;
}
