import { useId } from "react";
import Dropdown from "../../components/Dropdown";
import { CAMPUSES, type StudentNumberPreview, type StudentRecord } from "../../domain/studentRecord";
import styles from "./StudentRecordPanel.module.scss";

interface Props {
  needsNumber: boolean;
  record?: StudentRecord;
  campus?: number;
  preview: StudentNumberPreview | null;
  loading: boolean;
  error: string;
  disabled: boolean;
  busy: boolean;
  stale: boolean;
  issuing: boolean;
  detailsDirty: boolean;
  onCampus(value: number): void;
  onRefresh(): void;
  onIssue(): void;
}

export default function StudentRecordPanel({ needsNumber, record, campus, preview, loading, error, disabled, busy, stale, issuing, detailsDirty, onCampus, onRefresh, onIssue }: Props) {
  const id = useId();
  if (!needsNumber) return record ? <section className={styles.panel} aria-label="Выданная зачетка"><label className={styles.number}>Номер зачетки<input readOnly value={record.number} aria-describedby={`${id}-hint`} /></label><p id={`${id}-hint`} className={styles.note}>{record.year} год · корпус {record.campus}. Выданный номер сохраняется при смене группы и типа учётки.</p></section> : null;
  const ready = !stale && !loading && !error && preview?.campus === campus ? preview : null;
  const status = stale ? "Обновите проверку карточки" : !campus ? "Выберите корпус" : loading ? "Получаем номер…" : error ? "Номер не получен" : "Нужна актуальная проверка";
  return <section className={styles.panel} aria-label="Подготовка номера зачетки" aria-busy={loading}>
    <Dropdown label="Учебный корпус (обязательно)" placeholder="" value={String(campus || "")} options={CAMPUSES} onChange={(value) => onCampus(Number(value))} disabled={disabled} />
    {ready ? <label className={styles.number}>Предварительный номер зачетки<input readOnly value={ready.number} aria-describedby={`${id}-hint`} /></label> : <div className={styles.pending}><span>Предварительный номер зачетки</span><strong role="status">{status}</strong></div>}
    <p id={`${id}-hint`} className={styles.note}>{ready ? `${ready.year} год · корпус ${ready.campus}. Номер присвоится при ${issuing ? "подтверждении выдачи" : "сохранении учётки"}.` : "Номер формируется автоматически. До получения номера продолжить нельзя."}</p>
    {error && <div className={styles.error} role="alert"><p>{error}</p><button type="button" disabled={busy || loading || stale} onClick={onRefresh}>Повторить получение номера</button>{stale && <p>Сначала обновите проверку карточки.</p>}</div>}
    {!stale && !ready && Boolean(campus) && !loading && !error && <button type="button" disabled={busy} onClick={onRefresh}>Получить актуальный номер</button>}
    {issuing && <><button type="button" className={styles.primary} disabled={disabled || stale || !ready || detailsDirty} onClick={onIssue}>Выдать номер зачетки</button><p className={styles.note}>{stale ? "Данные или права изменились. Сначала обновите карточку." : detailsDirty ? "Сначала сохраните изменения данных, затем выдайте номер." : "Выдача потребует подтверждения. Номер станет постоянным."}</p></>}
  </section>;
}
