import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Dropdown from "../../components/Dropdown";
import type { AcademicMembership } from "../../domain/accounts";
import { lessonTypeLabels, type LessonType } from "../../domain/academic";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import type { ManagedLesson } from "../../domain/scheduleManagement";
import { validateLessonEditor } from "../../domain/scheduleEditing";
import styles from "./index.module.scss";

interface Props {
  value: ManagedLesson;
  weekStart: string;
  groupName: string;
  editing: boolean;
  blocked: boolean;
  busy: boolean;
  blockedMessage: string;
  subjects: { value: string; label: string; searchText?: string }[];
  teachers: { id: string; name: string; memberships: AcademicMembership[] }[];
  onChange(value: ManagedLesson): void;
  onApply(value: ManagedLesson): void;
  onCancel(): void;
  onConfigureAssignment(): void;
}
export default function LessonEditor({ value, weekStart, groupName, editing, blocked, busy, blockedMessage, subjects, teachers, onChange, onApply, onCancel, onConfigureAssignment }: Props) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [attempts, setAttempts] = useState(0);
  const selectedTeacher = teachers.find((teacher) => teacher.id === value.teacherId);
  const normalized = { ...value, room: value.room.trim(), teacherName: selectedTeacher?.name ?? "" };
  const errors = attempts ? validateLessonEditor(normalized, weekStart, teachers) : {};
  const availableTeachers = teachers.filter((teacher) => teacher.memberships.some((entry) => entry.subjectId === value.subjectId && entry.groupIds.includes(value.groupId)));
  useEffect(() => { formRef.current?.querySelector<HTMLElement>('[role="combobox"], input')?.focus(); }, []);
  useEffect(() => { if (attempts) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [attempts]);
  const submit = (event: FormEvent) => {
    event.preventDefault(); if (blocked) return;
    setAttempts((count) => count + 1);
    if (Object.keys(validateLessonEditor(normalized, weekStart, teachers)).length) return;
    onApply(normalized);
  };
  const lastDate = parseCalendarDate(weekStart)!; lastDate.setDate(lastDate.getDate() + 5);
  return <form ref={formRef} className={styles.editor} noValidate onSubmit={submit} aria-label="Редактор пары">
    <header className={styles.editorHeading}><div><h2>{editing ? "Изменить пару" : "Новая пара"}</h2><p>{groupName} · неделя с {parseCalendarDate(weekStart)?.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</p></div><button type="button" disabled={busy} onClick={onCancel}>К списку</button></header>
    {blockedMessage && <p className={styles.fieldError} role="status">{blockedMessage}</p>}
    {Object.keys(errors).length > 0 && <p className={styles.fieldError} role="alert">{errors.form ?? "Проверьте отмеченные поля. Изменения пары ещё не применены."}</p>}
    <fieldset className={styles.editorSection} disabled={blocked}><legend>Занятие</legend>
    <Dropdown searchable label="Предмет" placeholder="" value={value.subjectId} options={subjects} error={errors.subjectId} disabled={blocked} onChange={(subjectId) => onChange({ ...value, subjectId, teacherId: "", teacherName: "" })} />
    <Dropdown searchable label="Преподаватель" placeholder="" value={value.teacherId} options={availableTeachers.map((teacher) => ({ value: teacher.id, label: teacher.name }))} error={errors.teacherId} disabled={blocked} onChange={(teacherId) => onChange({ ...value, teacherId, teacherName: teachers.find((teacher) => teacher.id === teacherId)?.name ?? "" })} />
    {value.teacherId && !availableTeachers.some((teacher) => teacher.id === value.teacherId) && <p className={styles.fieldError} role="status">Ранее выбранный преподаватель больше недоступен для этой группы и предмета. Выберите преподавателя заново.</p>}
    <div className={styles.assignmentHint}>{!availableTeachers.length && <p className={styles.hint}>Для этого предмета и группы пока нет преподавателя.</p>}<button type="button" disabled={blocked || !value.subjectId} onClick={onConfigureAssignment}>Настроить назначение</button><p className={styles.hint}>Ввод пары сохранится на время перехода. Затем вернитесь сюда кнопкой «Вернуться к паре».</p></div>
    <Dropdown label="Тип занятия" value={value.type} options={Object.entries(lessonTypeLabels).map(([type, label]) => ({ value: type, label }))} error={errors.type} disabled={blocked} onChange={(type) => onChange({ ...value, type: type as LessonType })} />
    </fieldset>
    <fieldset className={`${styles.editorSection} ${styles.formGrid}`} disabled={blocked}><legend>Когда и где</legend>
      <label className={styles.fullWidth}>Дата<input type="date" required value={value.date} min={weekStart} max={toLocalDateKey(lastDate)} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? `${id}-date` : undefined} onChange={(event) => onChange({ ...value, date: event.target.value })} />{errors.date && <span id={`${id}-date`} className={styles.fieldError}>{errors.date}</span>}</label>
      <label>Начало<input type="time" required value={value.startsAt} aria-invalid={Boolean(errors.startsAt)} aria-describedby={errors.startsAt ? `${id}-start` : undefined} onChange={(event) => onChange({ ...value, startsAt: event.target.value })} />{errors.startsAt && <span id={`${id}-start`} className={styles.fieldError}>{errors.startsAt}</span>}</label>
      <label>Окончание<input type="time" required value={value.endsAt} aria-invalid={Boolean(errors.endsAt)} aria-describedby={errors.endsAt ? `${id}-end` : undefined} onChange={(event) => onChange({ ...value, endsAt: event.target.value })} />{errors.endsAt && <span id={`${id}-end`} className={styles.fieldError}>{errors.endsAt}</span>}</label>
      <label className={styles.fullWidth}>Аудитория<input required maxLength={100} value={value.room} aria-invalid={Boolean(errors.room)} aria-describedby={errors.room ? `${id}-room` : undefined} onChange={(event) => onChange({ ...value, room: event.target.value })} />{errors.room && <span id={`${id}-room`} className={styles.fieldError}>{errors.room}</span>}</label>
    </fieldset>
    <footer className={styles.editorFooter}><p>Все поля обязательны. После применения сохраните черновик недели.</p><button className={styles.primary} type="submit" disabled={blocked}>{editing ? "Применить к неделе" : "Добавить в неделю"}</button></footer>
  </form>;
}
