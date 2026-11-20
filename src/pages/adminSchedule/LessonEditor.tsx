import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Dropdown from "../../components/Dropdown";
import TemporalField from "../../components/DateTimePicker/Field";
import { canScheduleTeacher, type ScheduleTeacher } from "../../domain/teachingAssignments";
import { lessonTypeLabels, type LessonType } from "../../domain/academic";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import type { ManagedLesson } from "../../domain/scheduleManagement";
import { validateLessonEditor } from "../../domain/scheduleEditing";
import styles from "./index.module.scss";
import { indexRooms, roomLabel, roomLessonIssues, type Room } from "../../domain/rooms";

interface Props {
  value: ManagedLesson;
  weekStart: string;
  groupName: string;
  editing: boolean;
  blocked: boolean;
  busy: boolean;
  blockedMessage: string;
  subjects: { value: string; label: string; searchText?: string }[];
  teachers: Array<ScheduleTeacher & { name: string }>;
  rooms: Room[];
  onChange(value: ManagedLesson): void;
  onApply(value: ManagedLesson): void;
  onCancel(): void;
  onConfigureAssignment(): void;
}
export default function LessonEditor({ value, weekStart, groupName, editing, blocked, busy, blockedMessage, subjects, teachers, rooms, onChange, onApply, onCancel, onConfigureAssignment }: Props) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [attempts, setAttempts] = useState(0);
  const selectedTeacher = teachers.find((teacher) => teacher.id === value.teacherId);
  const normalized = { ...value, room: value.room.trim(), teacherName: selectedTeacher?.name ?? "" };
  const validate = () => {
    const errors = validateLessonEditor(normalized, weekStart, teachers);
    const roomIssue = roomLessonIssues(normalized, indexRooms({ version: 1, revision: 0, rooms, history: [] }), editing && !value.roomId)[0];
    if (roomIssue) errors.room ??= roomIssue;
    return errors;
  };
  const errors = attempts ? validate() : {};
  const availableTeachers = teachers.filter((teacher) => canScheduleTeacher(teacher, value));
  useEffect(() => { formRef.current?.querySelector<HTMLElement>('[role="combobox"], input')?.focus(); }, []);
  useEffect(() => { if (attempts) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]')?.focus(); }, [attempts]);
  const submit = (event: FormEvent) => {
    event.preventDefault(); if (blocked) return;
    setAttempts((count) => count + 1);
    if (Object.values(validate()).some(Boolean)) return;
    onApply(normalized);
  };
  const lastDate = parseCalendarDate(weekStart)!; lastDate.setDate(lastDate.getDate() + 5);
  return <form ref={formRef} className={styles.editor} noValidate onSubmit={submit} aria-label="Редактор пары">
    <header className={styles.editorHeading}><div><h2>{editing ? "Изменить пару" : "Новая пара"}</h2><p>{groupName} · неделя с {parseCalendarDate(weekStart)?.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</p></div><button type="button" disabled={busy} onClick={onCancel}>К списку</button></header>
    {blockedMessage && <p className={styles.fieldError} role="status">{blockedMessage}</p>}
    {Object.keys(errors).length > 0 && <p className={styles.fieldError} role="alert">{errors.form ?? "Проверьте отмеченные поля. Изменения пары ещё не применены."}</p>}
    <fieldset className={styles.editorSection} disabled={blocked}><legend>Занятие</legend>
    <Dropdown searchable label="Предмет" placeholder="" value={value.subjectId} options={subjects} error={errors.subjectId} disabled={blocked} onChange={(subjectId) => onChange({ ...value, subjectId, teacherId: "", teacherName: "" })} />
    <Dropdown label="Тип занятия" value={value.type} options={Object.entries(lessonTypeLabels).map(([type, label]) => ({ value: type, label }))} error={errors.type} disabled={blocked} onChange={(type) => onChange({ ...value, type: type as LessonType })} />
    <Dropdown searchable label="Преподаватель" placeholder="" value={value.teacherId} options={availableTeachers.map((teacher) => ({ value: teacher.id, label: teacher.name }))} error={errors.teacherId} disabled={blocked} onChange={(teacherId) => onChange({ ...value, teacherId, teacherName: teachers.find((teacher) => teacher.id === teacherId)?.name ?? "" })} />
    {value.teacherId && !availableTeachers.some((teacher) => teacher.id === value.teacherId) && <p className={styles.fieldError} role="status">Ранее выбранный преподаватель больше недоступен для этой группы и предмета. Выберите преподавателя заново.</p>}
    <div className={styles.assignmentHint}>{!availableTeachers.length && <p className={styles.hint}>Для этого предмета и группы пока нет преподавателя.</p>}<button type="button" disabled={blocked || !value.subjectId} onClick={onConfigureAssignment}>Настроить назначение</button><p className={styles.hint}>Ввод пары сохранится на время перехода. Затем вернитесь сюда кнопкой «Вернуться к паре».</p></div>
    </fieldset>
    <fieldset className={`${styles.editorSection} ${styles.formGrid}`} disabled={blocked}><legend>Когда и где</legend>
      <TemporalField className={styles.fullWidth} id={`${id}-date`} label="Дата" required disabled={blocked} value={value.date} min={weekStart} max={toLocalDateKey(lastDate)} error={errors.date} onChange={date => onChange({ ...value, date })} />
      <TemporalField id={`${id}-start`} label="Начало" kind="time" required disabled={blocked} value={value.startsAt} error={errors.startsAt} onChange={startsAt => onChange({ ...value, startsAt })} />
      <TemporalField id={`${id}-end`} label="Окончание" kind="time" required disabled={blocked} value={value.endsAt} error={errors.endsAt} onChange={endsAt => onChange({ ...value, endsAt })} />
      <div className={styles.fullWidth}><Dropdown searchable label="Аудитория и корпус" placeholder="" value={value.roomId ?? (editing && value.room ? "legacy" : "")} options={[...(editing && !value.roomId && value.room ? [{ value: "legacy", label: `${value.room} · прежнее название` }] : []), ...rooms.filter(room => room.status === "active").map(room => ({ value: room.id, label: roomLabel(room), searchText: [...room.equipment, ...room.aliases].join(" ") }))]} error={errors.room} disabled={blocked} onChange={roomId => { const room = rooms.find(row => row.id === roomId && row.status === "active"); if (room) onChange({ ...value, roomId, roomRevision: room.revision, room: room.name, roomBuilding: room.building }); }} />{!value.roomId && value.room && <p className={styles.hint}>Прежнее название сохранено без автоматической привязки. Выберите карточку, чтобы уточнить корпус.</p>}{value.roomId && roomLessonIssues(value, indexRooms({ version: 1, revision: 0, rooms, history: [] }), false).length > 0 && <p className={styles.fieldError} role="status">Карточка аудитории недоступна или изменилась. Выберите аудиторию заново.</p>}{!rooms.some(room => room.status === "active") && <p className={styles.hint}>Добавьте действующие аудитории в справочник через действия недели.</p>}</div>
    </fieldset>
    <footer className={styles.editorFooter}><p>Все поля обязательны. После применения сохраните черновик недели.</p><button className={styles.primary} type="submit" disabled={blocked}>{editing ? "Применить к неделе" : "Добавить в неделю"}</button></footer>
  </form>;
}
