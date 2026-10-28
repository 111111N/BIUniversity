import { useState } from "react";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import ConfirmDialog from "../../components/ConfirmDialog";
import Dropdown from "../../components/Dropdown";
import { groupNameKey, isGroupActive } from "../../domain/groupCatalog";
import { CAMPUSES } from "../../domain/studentRecord";
import type { StudentImportGroup } from "../../domain/studentImport";
import type { StudentImportMapping } from "../../domain/importTable";
import type { ImportRowDraft } from "./rowEditing";
import styles from "./index.module.scss";

interface Props {
  line: number;
  initial: ImportRowDraft;
  mapping: StudentImportMapping;
  groups: StudentImportGroup[];
  defaultGroup: string;
  defaultCampus: number | null;
  errors: string[];
  busy: boolean;
  disabled: boolean;
  error: string;
  onClose(): void;
  onReview(draft: ImportRowDraft): void;
}

export default function ImportRowEditor({ line, initial, mapping, groups, defaultGroup, defaultCampus, errors, busy, disabled, error, onClose, onReview }: Props) {
  const [draft, setDraft] = useState(initial);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const close = () => { if (!busy) { if (dirty) setConfirmCancel(true); else onClose(); } };
  const change = (field: keyof ImportRowDraft, value: string) => setDraft((previous) => ({ ...previous, [field]: value }));
  const group = groups.find((item) => groupNameKey(item.name) === groupNameKey(draft.group));
  const effectiveGroup = draft.group.trim() ? group : groups.find((item) => item.name === defaultGroup);
  const groupOptions = [{ value: "", label: `Общая группа: ${defaultGroup || "не выбрана"}` }, ...groups.filter(isGroupActive).map((item) => ({ value: item.name, label: item.name }))];
  if (draft.group && !groupOptions.some((item) => item.value === draft.group)) {
    const status = group ? isGroupActive(group) ? "исходное значение" : "в архиве" : "не найдена";
    groupOptions.push({ value: draft.group, label: `${draft.group} · ${status}` });
  }
  const campus = /^(?:корпус\s*)?([1-9])$/iu.exec(draft.campus.normalize("NFKC").trim())?.[1] ?? draft.campus;
  const campusOptions = [{ value: "", label: "Из общих настроек или группы" }, ...CAMPUSES];
  if (campus && !campusOptions.some((item) => item.value === campus)) campusOptions.push({ value: campus, label: `${draft.campus} · проверьте корпус` });

  return <>
    <RecordEditor title={`Исправление строки ${line}`} context="Исправьте данные и проверьте весь список заново. Учётки на этом шаге не создаются." busy={busy} onClose={close} closeLabel="К проверке списка">
      <form className={styles.rowForm} noValidate onSubmit={(event) => { event.preventDefault(); if (!disabled) onReview(draft); }}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <section className={styles.rowProblems} aria-label="Ошибки последней проверки"><h3>Что нужно исправить</h3><ul>{errors.map((issue) => <li key={issue}>{issue}</li>)}</ul></section>
        <div className={styles.rowFields}>
          <label>ФИО (обязательно)<textarea rows={2} value={draft.name} disabled={busy} maxLength={500} onChange={(event) => change("name", event.target.value)} /></label>
          <label>Логин (обязательно)<input value={draft.login} disabled={busy} maxLength={500} autoCapitalize="none" spellCheck={false} onChange={(event) => change("login", event.target.value)} /></label>
          {mapping.group >= 0 ? <Dropdown searchable label="Группа" value={draft.group} options={groupOptions} onChange={(value) => change("group", value)} disabled={busy} placeholder="" /> : <div className={styles.inherited}><span>Группа</span><strong>{defaultGroup || "Не выбрана"}</strong><span>Из общих настроек списка</span></div>}
          {mapping.campus >= 0 ? <Dropdown label="Корпус" value={campus} options={campusOptions} onChange={(value) => change("campus", value)} disabled={busy} placeholder="" /> : <div className={styles.inherited}><span>Корпус</span><strong>{defaultCampus ?? effectiveGroup?.campus ?? "Не указан"}</strong><span>Из общих настроек или группы</span></div>}
          {mapping.email >= 0 && <label>Электронная почта<input value={draft.email} disabled={busy} maxLength={500} inputMode="email" autoCapitalize="none" spellCheck={false} onChange={(event) => change("email", event.target.value)} /></label>}
        </div>
        <p className={styles.note}>Общие значения и состав столбцов меняются на шаге «Столбцы». После исправления номера зачеток пересчитаются для всего списка.</p>
        <RecordEditorActions label="Проверить исправление" disabled={disabled} busy={busy} busyLabel="Проверяем…" hint="Сначала проверка, затем отдельное создание студентов." onCancel={close} />
      </form>
    </RecordEditor>
    {confirmCancel && <ConfirmDialog title="Отменить исправление строки?" confirmLabel="Отменить исправление" cancelLabel="Продолжить редактирование" onConfirm={onClose} onCancel={() => setConfirmCancel(false)}><p>Изменения этой строки будут потеряны. Исходная таблица и предыдущая проверка сохранятся.</p></ConfirmDialog>}
  </>;
}
