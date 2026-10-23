import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import WeekPicker from "../../components/WeekPicker";
import Dropdown from "../../components/Dropdown";
import Modal from "../../components/Modal";
import { ACADEMIC_GROUPS, getAcademicSubjectDefinition, getSubjectGroups, SUBJECTS } from "../../data/academicCatalog";
import { getManagedScheduleTeachers, getManagedScheduleWeek, getManagedWeekConflicts, publishManagedScheduleDraft, readManagedScheduleState, saveManagedScheduleDraft, subscribeManagedSchedule } from "../../data/managedScheduleStore";
import { subscribeAccounts } from "../../data/accountStore";
import { getManagedWeekKey, validateManagedLesson, type ManagedLesson } from "../../domain/scheduleManagement";
import { lessonTypeLabels, type LessonType } from "../../domain/academic";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import { formatCount } from "../../domain/formatCount";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useSubjectCatalog } from "../../hooks/useSubjectCatalog";
import styles from "./index.module.scss";

const freshLesson = (date: string, groupId: string): ManagedLesson => ({
  id: `managed:${crypto.randomUUID()}`, scheduleId: Date.now() * 1000 + Math.floor(Math.random() * 1000),
  subjectId: SUBJECTS.find((subject) => getSubjectGroups(subject.id).some((group) => group.id === groupId))?.id ?? SUBJECTS[0].id,
  groupId, teacherId: "", teacherName: "", date, startsAt: "08:30", endsAt: "10:00", type: "lecture", room: "",
});
const sortLessons = (lessons: ManagedLesson[]) => [...lessons].sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt));

const AdminSchedulePage = () => {
  const { currentUser } = useRole();
  const { subjects, error: catalogError } = useSubjectCatalog();
  const [params, setParams] = useSearchParams();
  const weekStart = getManagedWeekKey(params.get("date") ?? "") || getManagedWeekKey(toLocalDateKey(new Date()));
  const groupId = ACADEMIC_GROUPS.some((group) => group.id === params.get("group")) ? params.get("group")! : ACADEMIC_GROUPS[0].id;
  const scope = `${weekStart}:${groupId}`;
  const [state, setState] = useState(readManagedScheduleState);
  const [teachers, setTeachers] = useState(getManagedScheduleTeachers);
  const initial = getManagedScheduleWeek(state.snapshot, weekStart, groupId);
  const [lessons, setLessons] = useState<ManagedLesson[]>(initial.lessons);
  const [saved, setSaved] = useState(JSON.stringify(initial.lessons));
  const [revision, setRevision] = useState(state.snapshot.revision);
  const [editor, setEditor] = useState<ManagedLesson | null>(null);
  const [editorBase, setEditorBase] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const dirty = saved !== JSON.stringify(lessons);
  const editorDirty = Boolean(editor && JSON.stringify(editor) !== editorBase);
  const dirtyRef = useRef(dirty || editorDirty);
  dirtyRef.current = dirty || editorDirty;
  const scopeRef = useRef(scope);
  const editorRef = useRef<HTMLFormElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useUnsavedChangesWarning(dirty || editorDirty || busy);

  useEffect(() => subscribeManagedSchedule(() => setState(readManagedScheduleState())), []);
  useEffect(() => subscribeAccounts(() => setTeachers(getManagedScheduleTeachers())), []);
  useEffect(() => {
    if (editorRef.current) editorRef.current.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    else if (returnFocusRef.current?.isConnected) { returnFocusRef.current.focus({ preventScroll: true }); returnFocusRef.current = null; }
  }, [editor?.id]);
  useEffect(() => {
    const changedScope = scopeRef.current !== scope;
    if (!changedScope && dirtyRef.current) return;
    scopeRef.current = scope;
    const next = getManagedScheduleWeek(state.snapshot, weekStart, groupId);
    setLessons(next.lessons);
    setSaved(JSON.stringify(next.lessons));
    setRevision(state.snapshot.revision);
    setEditor(null);
    setError("");
    if (changedScope) setMessage("");
  }, [scope, groupId, weekStart, state.snapshot]);

  const conflicts = useMemo(() => getManagedWeekConflicts(state.snapshot, { weekStart, groupId, lessons }), [state.snapshot, weekStart, groupId, lessons]);
  const hasDraft = state.snapshot.drafts.some((week) => week.weekStart === weekStart && week.groupId === groupId);
  const published = state.snapshot.published.find((week) => week.weekStart === weekStart && week.groupId === groupId);
  const stale = revision !== state.snapshot.revision;
  const blocked = busy || Boolean(state.error) || Boolean(catalogError) || currentUser.role !== "configurator";
  const updateScope = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); next.set(key, value); return next; });
  const startEditing = (lesson?: ManagedLesson) => {
    if (editorDirty) { setError("Сначала добавьте изменения текущей пары в неделю или отмените редактирование."); return; }
    const next = lesson ? { ...lesson } : freshLesson(weekStart, groupId);
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor(next); setEditorBase(JSON.stringify(next)); setError(""); setMessage("");
  };
  const submitLesson = (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    const teacher = teachers.find((entry) => entry.id === editor.teacherId);
    const next = { ...editor, room: editor.room.trim(), teacherName: teacher?.name ?? "" };
    const errors = validateManagedLesson(next);
    if (getManagedWeekKey(next.date) !== weekStart) errors.push("Выберите дату внутри открытой недели. Для другой недели используйте отдельный черновик.");
    if (!teacher?.memberships.some((membership) => membership.subjectId === next.subjectId && membership.groupIds.includes(groupId))) errors.push("Назначьте преподавателю эту группу в разделе «Дисциплины».");
    if (errors.length) { setError(errors.join(" ")); return; }
    setLessons((current) => sortLessons([...current.filter((lesson) => lesson.id !== next.id), next]));
    setEditor(null); setError(""); setMessage("Пара добавлена в рабочую неделю. Сохраните черновик, затем опубликуйте.");
  };
  const save = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const snapshot = await saveManagedScheduleDraft({ actorId: currentUser.id, expectedRevision: revision, weekStart, groupId, lessons });
      dirtyRef.current = false; setState({ snapshot, error: "" }); setRevision(snapshot.revision); setSaved(JSON.stringify(lessons));
      setMessage("Черновик сохранён. Студенты и преподаватели увидят изменения после публикации.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось сохранить черновик."); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const snapshot = await publishManagedScheduleDraft({ actorId: currentUser.id, expectedRevision: revision, weekStart, groupId });
      dirtyRef.current = false; setState({ snapshot, error: "" }); setRevision(snapshot.revision); setConfirmPublish(false);
      setMessage("Неделя опубликована. Расписание и новые занятия журнала обновлены.");
    } catch (caught) { setConfirmPublish(false); setError(caught instanceof Error ? caught.message : "Не удалось опубликовать неделю."); }
    finally { setBusy(false); }
  };
  const reset = () => {
    dirtyRef.current = false;
    const latest = readManagedScheduleState();
    const next = getManagedScheduleWeek(latest.snapshot, weekStart, groupId);
    setState(latest); setLessons(next.lessons); setSaved(JSON.stringify(next.lessons)); setRevision(latest.snapshot.revision); setEditor(null); setError(""); setMessage("");
  };
  const availableTeachers = editor ? teachers.filter((teacher) => teacher.memberships.some((membership) => membership.subjectId === editor.subjectId && membership.groupIds.includes(groupId))) : [];

  return <div className={`pageContainer ${styles.page}`}>
    <div className={styles.navigation}><WeekPicker value={parseCalendarDate(weekStart)} onWeekChange={(date) => updateScope("date", toLocalDateKey(date))} /></div>
    <div className={styles.toolbar}>
      <Dropdown searchable label="Учебная группа" value={groupId} options={ACADEMIC_GROUPS.map((group) => ({ value: group.id, label: group.name }))} onChange={(value) => updateScope("group", value)} disabled={busy} />
      <div className={styles.status}><strong>{formatCount(lessons.length, ["занятие", "занятия", "занятий"])}</strong><span>{dirty || editorDirty ? "Есть несохранённые изменения" : hasDraft ? "Черновик сохранён" : published ? "Опубликовано" : "Новая неделя"}</span></div>
      <div className={styles.actions}><button type="button" disabled={blocked || Boolean(editor)} onClick={() => startEditing()}>Добавить пару</button><button type="button" disabled={blocked || Boolean(editor) || stale || (!dirty && hasDraft)} onClick={() => void save()}>Сохранить черновик</button><button className={styles.primary} type="button" disabled={blocked || dirty || Boolean(editor) || !hasDraft || stale || conflicts.length > 0} onClick={() => setConfirmPublish(true)}>Опубликовать</button></div>
    </div>
    <p className={styles.explanation}>Добавьте пары, сохраните черновик и опубликуйте неделю. Изменения увидит только выбранная группа; до публикации её расписание останется прежним.</p>
    {state.error && <div role="alert" className={styles.error}>{state.error}</div>}
    {catalogError && <div role="alert" className={styles.error}>{catalogError}</div>}
    {stale && <div role="alert" className={styles.error}>Расписание изменено в другой вкладке. Скопируйте нужные изменения перед обновлением. <button type="button" disabled={busy} onClick={reset}>Загрузить актуальную неделю</button></div>}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {message && <p role="status" className={styles.message}>{message}</p>}
    {conflicts.length > 0 && <details className={styles.conflicts} open><summary>Конфликты: {conflicts.length} · публикация недоступна</summary><ul>{conflicts.map((conflict, index) => <li key={`${conflict.lessonId}:${conflict.otherId}:${conflict.kind}:${index}`}>{conflict.message}</li>)}</ul><p>Проверяются все опубликованные группы и остальные демонстрационные занятия недели. Черновик можно сохранить с конфликтами.</p></details>}
    <div className={`${styles.workspace} ${editor ? styles.withEditor : ""}`}>
      <section aria-label="Занятия недели" className={styles.lessons}>
        {lessons.length === 0 ? <div className={styles.empty}><strong>В этой рабочей неделе пока нет пар</strong><p>Добавьте занятия и сохраните черновик. Пустую неделю также можно опубликовать, чтобы убрать пары группы из расписания.</p><button type="button" disabled={blocked || Boolean(editor)} onClick={() => startEditing()}>Добавить первую пару</button></div> : sortLessons(lessons).map((lesson) => <article key={lesson.id} className={styles.card}>
          <div className={styles.time}><strong>{lesson.startsAt}–{lesson.endsAt}</strong><span>{parseCalendarDate(lesson.date)?.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}</span></div>
          <div className={styles.details}><strong>{getAcademicSubjectDefinition(lesson.subjectId)?.name}</strong><span>{lessonTypeLabels[lesson.type]} · Ауд. {lesson.room} · {lesson.teacherName}</span></div>
          <div className={styles.cardActions}><button type="button" disabled={blocked || (editor !== null && editor.id !== lesson.id)} onClick={() => startEditing(lesson)}>Изменить</button><button type="button" disabled={blocked || Boolean(editor)} onClick={() => { setLessons((current) => current.filter((entry) => entry.id !== lesson.id)); setMessage("Пара убрана из рабочей недели. В опубликованном расписании она останется до следующей публикации."); }}>Убрать</button></div>
        </article>)}
        {(dirty || editorDirty) && <button className={styles.reset} type="button" disabled={busy} onClick={reset}>Отменить несохранённые изменения</button>}
      </section>
      {editor && <form ref={editorRef} className={styles.editor} onSubmit={submitLesson} aria-label="Редактор пары">
        <div className={styles.editorHeading}><h2>{lessons.some((lesson) => lesson.id === editor.id) ? "Изменить пару" : "Новая пара"}</h2><button type="button" disabled={busy} onClick={() => setEditor(null)}>Отмена</button></div>
        <Dropdown searchable label="Предмет" value={editor.subjectId} options={subjects.filter((subject) => getSubjectGroups(subject.id).some((group) => group.id === groupId)).map((subject) => ({ value: subject.id, label: subject.name }))} onChange={(subjectId) => setEditor({ ...editor, subjectId, teacherId: "", teacherName: "" })} />
        <Dropdown searchable label="Преподаватель" value={editor.teacherId} options={availableTeachers.map((teacher) => ({ value: teacher.id, label: teacher.name }))} onChange={(teacherId) => setEditor({ ...editor, teacherId, teacherName: teachers.find((teacher) => teacher.id === teacherId)?.name ?? "" })} />
        {!availableTeachers.length && <p className={styles.hint}>Нет преподавателей для этого предмета и группы. Добавьте назначение в разделе «Дисциплины».</p>}
        <div className={styles.formGrid}><label>Дата<input type="date" required value={editor.date} min={weekStart} max={(() => { const date = parseCalendarDate(weekStart)!; date.setDate(date.getDate() + 5); return toLocalDateKey(date); })()} onChange={(event) => setEditor({ ...editor, date: event.target.value })} /></label><label>Аудитория<input required maxLength={100} placeholder="305" value={editor.room} onChange={(event) => setEditor({ ...editor, room: event.target.value })} /></label><label>Начало<input type="time" required value={editor.startsAt} onChange={(event) => setEditor({ ...editor, startsAt: event.target.value })} /></label><label>Окончание<input type="time" required value={editor.endsAt} onChange={(event) => setEditor({ ...editor, endsAt: event.target.value })} /></label></div>
        <Dropdown label="Тип занятия" value={editor.type} options={Object.entries(lessonTypeLabels).map(([value, label]) => ({ value, label }))} onChange={(type) => setEditor({ ...editor, type: type as LessonType })} />
        <button className={styles.primary} type="submit" disabled={blocked}>Добавить изменения в неделю</button>
      </form>}
    </div>
    {confirmPublish && <Modal labelledBy="publish-schedule-title" onClose={() => { if (!busy) setConfirmPublish(false); }} className={styles.confirm}>
      <h2 id="publish-schedule-title">Опубликовать неделю?</h2><p>Группа {ACADEMIC_GROUPS.find((group) => group.id === groupId)?.name}, с {parseCalendarDate(weekStart)?.toLocaleDateString("ru-RU")}: {formatCount(lessons.length, ["занятие", "занятия", "занятий"])}.</p><p>Текущее расписание группы на эту неделю будет заменено. Удалённые опубликованные пары останутся в журнале отменёнными, с сохранением прежних отметок.</p><div className={styles.actions}><button type="button" disabled={busy} onClick={() => setConfirmPublish(false)}>Вернуться</button><button className={styles.primary} type="button" disabled={busy} onClick={() => void publish()}>{busy ? "Публикуем…" : "Опубликовать неделю"}</button></div>
    </Modal>}
  </div>;
};

export default AdminSchedulePage;
