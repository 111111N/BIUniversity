import { useId, useState } from "react";
import Dropdown from "../../components/Dropdown";
import type { CurriculumSnapshot } from "../../data/curriculaStore";
import { CURRICULUM_CATEGORIES, CURRICULUM_CONTROLS, CURRICULUM_HOURS, curriculumContact, curriculumTotal, emptyCurriculumHours, type CurriculumEntry, type CurriculumHours } from "../../domain/curriculumTypes";
import styles from "./index.module.scss";

export const formatHours = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
export function CurriculumRowsSummary({ entries, hoursPerCredit }: { entries: CurriculumEntry[]; hoursPerCredit: number }) {
  const hours = entries.filter(row => row.category !== "optional").reduce((sum, row) => sum + Math.round(curriculumTotal(row.hours) * 100), 0) / 100;
  return <p className={styles.note}>Строк: {entries.length} · Объём без факультативов: {formatHours(hours)} ак. ч.{hoursPerCredit > 0 ? ` · ${formatHours(hours / hoursPerCredit)} з.е.` : ""}</p>;
}
export function CurriculumReadOnlyRows({ entries }: { entries: CurriculumEntry[] }) {
  const [page, setPage] = useState(1), pages = Math.max(1, Math.ceil(entries.length / 20)), current = Math.min(page, pages);
  return <div className={styles.list}>{entries.slice((current - 1) * 20, current * 20).map(entry => <details key={entry.id} className={styles.row}>
    <summary>{entry.subject.name} · {entry.semester} семестр · {formatHours(curriculumTotal(entry.hours))} ак. ч.</summary>
    <p>{CURRICULUM_CATEGORIES[entry.category]} · {entry.controls.map(control => CURRICULUM_CONTROLS[control]).join(", ") || "Без отдельной формы контроля"}</p>
    <dl className={styles.hoursRead}>{Object.entries(CURRICULUM_HOURS).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatHours(entry.hours[key as keyof CurriculumHours])}</dd></div>)}</dl>
  </details>)}{pages > 1 && <nav className={styles.actions} aria-label="Строки плана"><button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>Назад</button><span>{current} / {pages}</span><button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>Далее</button></nav>}</div>;
}
export default function CurriculumRows({ entries, subjects, disabled, onChange }: { entries: CurriculumEntry[]; subjects: CurriculumSnapshot["subjects"]; disabled: boolean; onChange(entries: CurriculumEntry[]): void }) {
  const [selectedId, setSelectedId] = useState(""), [page, setPage] = useState(1), [error, setError] = useState("");
  const fieldId = useId(), selected = entries.find(entry => entry.id === selectedId);
  const pages = Math.max(1, Math.ceil(entries.length / 20)), current = Math.min(page, pages);
  const update = (patch: Partial<CurriculumEntry>) => { if (selected && !disabled) onChange(entries.map(entry => entry.id === selected.id ? { ...entry, ...patch } : entry)); };
  const add = () => {
    if (disabled || entries.length >= 500) return;
    try {
      const id = crypto.randomUUID();
      onChange([...entries, { id, subject: { id: "", revision: 0, name: "", shortName: "" }, semester: 1, category: "required", controls: [], hours: emptyCurriculumHours() }]);
      setSelectedId(id); setError("");
    } catch (failure) { console.error("Не удалось добавить строку учебного плана:", failure); setError("Не удалось подготовить строку плана."); }
  };
  const subjectOptions = subjects.filter(row => row.status !== "archived").map(row => ({ value: row.id, label: row.name }));
  if (selected?.subject.id && !subjectOptions.some(row => row.value === selected.subject.id)) subjectOptions.push({ value: selected.subject.id, label: `${selected.subject.name} (недоступна)` });
  return <section className={styles.list} aria-label="Дисциплины учебного плана"><div className={styles.actions}><strong>Дисциплины по семестрам</strong><button type="button" disabled={disabled || entries.length >= 500} onClick={add}>Добавить дисциплину</button></div>
    {error && <p role="alert">{error}</p>}
    {selected ? <div className={styles.rowEditor}><div className={styles.actions}><strong>{selected.subject.name || "Новая дисциплина"}</strong><button type="button" onClick={() => setSelectedId("")}>К строкам плана</button></div>
      <Dropdown label="Дисциплина" value={selected.subject.id} options={subjectOptions} disabled={disabled} searchable onChange={value => { const row = subjects.find(subject => subject.id === value && subject.status !== "archived"); if (row) update({ subject: { id: row.id, revision: row.revision ?? 0, name: row.name, shortName: row.shortName } }); }} />
      <label className={styles.field} htmlFor={`${fieldId}-semester`}>Номер семестра в плане<input id={`${fieldId}-semester`} type="number" required min={1} max={30} step={1} value={selected.semester || ""} disabled={disabled} onChange={event => update({ semester: Number(event.target.value) })} /></label>
      <Dropdown label="Категория" value={selected.category} options={Object.entries(CURRICULUM_CATEGORIES).map(([value, label]) => ({ value, label }))} disabled={disabled} onChange={value => update({ category: value as CurriculumEntry["category"] })} />
      <fieldset className={styles.fields} disabled={disabled}><legend>Формы контроля</legend><div className={styles.checks}>{Object.entries(CURRICULUM_CONTROLS).map(([value, label]) => <label key={value}><input type="checkbox" checked={selected.controls.includes(value as keyof typeof CURRICULUM_CONTROLS)} onChange={event => update({ controls: event.target.checked ? [...selected.controls, value as keyof typeof CURRICULUM_CONTROLS] : selected.controls.filter(control => control !== value) })} />{label}</label>)}</div></fieldset>
      <fieldset className={styles.fields} disabled={disabled}><legend>Нагрузка, академические часы</legend><div className={styles.hourGrid}>{Object.entries(CURRICULUM_HOURS).map(([key, label]) => <label className={styles.field} htmlFor={`${fieldId}-${key}`} key={key}>{label}<input id={`${fieldId}-${key}`} type="number" required min={0} max={100000} step={0.01} value={selected.hours[key as keyof CurriculumHours]} onChange={event => update({ hours: { ...selected.hours, [key]: Number(event.target.value) } })} /></label>)}</div></fieldset>
      <p>Контактная: {formatHours(curriculumContact(selected.hours))} · Всего: {formatHours(curriculumTotal(selected.hours))} ак. ч.</p>
      <button className={styles.remove} type="button" disabled={disabled} onClick={() => { onChange(entries.filter(entry => entry.id !== selected.id)); setSelectedId(""); }}>Удалить строку из черновика</button>
    </div> : <><div className={styles.list}>{entries.slice((current - 1) * 20, current * 20).map(entry => <div className={styles.row} key={entry.id}><span>{entry.subject.name || "Дисциплина не выбрана"} · {entry.semester} семестр · {formatHours(curriculumTotal(entry.hours))} ак. ч.</span><button type="button" disabled={disabled} onClick={() => setSelectedId(entry.id)}>Изменить</button></div>)}</div>
      {!entries.length && <p className={styles.note}>В черновике пока нет дисциплин.</p>}
      {pages > 1 && <nav className={styles.actions} aria-label="Строки черновика"><button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>Назад</button><span>{current} / {pages}</span><button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>Далее</button></nav>}</>}
  </section>;
}
