import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import WeekPicker from "../../components/WeekPicker";
import Dropdown from "../../components/Dropdown";
import { ACADEMIC_GROUPS, getAcademicSubjectDefinition, getSubjectGroups, SUBJECTS } from "../../data/academicCatalog";
import { getManagedScheduleTeachers, getManagedScheduleWeek, getManagedWeekConflicts, readManagedScheduleState, saveManagedScheduleDraft, subscribeManagedSchedule } from "../../data/managedScheduleStore";
import { subscribeAccounts } from "../../data/accountStore";
import { getManagedWeekKey, type ManagedLesson } from "../../domain/scheduleManagement";
import { lessonTypeLabels } from "../../domain/academic";
import { resolveScheduleEditingScope, restoreRemovedScheduleLesson } from "../../domain/scheduleEditing";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import { formatCount } from "../../domain/formatCount";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useSubjectCatalog } from "../../hooks/useSubjectCatalog";
import styles from "./index.module.scss";
import { isGroupActive } from "../../domain/groupCatalog";
import CopyWeekDialog from "./CopyWeekDialog";
import PublicationReview from "./PublicationReview";
import LessonEditor from "./LessonEditor";
import ConfirmDialog from "../../components/ConfirmDialog";
import { getWeekActionState, groupScheduleLessons } from "./presentation";
import { useScheduleAssignmentHandoff } from "../../components/ScheduleAssignmentProvider";
import { SCHEDULE_RETURN_PARAM } from "../../domain/scheduleAssignmentHandoff";
import { changesLocation, type UnsavedNavigationCheck } from "../../domain/unsavedNavigation";

const freshLesson = (date: string, groupId: string): ManagedLesson => ({
  id: `managed:${crypto.randomUUID()}`, scheduleId: Date.now() * 1000 + Math.floor(Math.random() * 1000),
  subjectId: SUBJECTS.find((subject) => getSubjectGroups(subject.id).some((group) => group.id === groupId))?.id ?? SUBJECTS[0]?.id ?? "",
  groupId, teacherId: "", teacherName: "", date, startsAt: "08:30", endsAt: "10:00", type: "lecture", room: "",
});
const sortLessons = (lessons: ManagedLesson[]) => [...lessons].sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt));

const AdminSchedulePage = () => {
  const { currentUser } = useRole();
  const { subjects, error: catalogError, refresh: refreshCatalog } = useSubjectCatalog();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { store: handoff } = useScheduleAssignmentHandoff();
  const [openingScope] = useState(() => handoff.matchesSchedule({ pathname: "/admin/schedule", search: params.toString() }) ? handoff.getOpeningScope(params.toString()) : { group: null, date: null });
  // Browser Back can return to an address without scope parameters. Keep the original scope even after midnight or a catalog change.
  const selection = resolveScheduleEditingScope(params.get("group") ?? openingScope.group, params.get("date") ?? openingScope.date, ACADEMIC_GROUPS, toLocalDateKey(new Date()));
  const { weekStart, groupId, valid: validScope } = selection;
  const scope = `${weekStart}:${groupId}`;
  const [state, setState] = useState(readManagedScheduleState);
  const [teachers, setTeachers] = useState(getManagedScheduleTeachers);
  const initial = getManagedScheduleWeek(state.snapshot, weekStart, groupId);
  const [resumed] = useState(() => validScope ? handoff.readSchedule(params.toString(), weekStart, groupId) : null);
  const [lessons, setLessons] = useState<ManagedLesson[]>(resumed?.lessons ?? initial.lessons);
  const [saved, setSaved] = useState(resumed?.saved ?? JSON.stringify(initial.lessons));
  const [revision, setRevision] = useState(resumed?.revision ?? state.snapshot.revision);
  const [editor, setEditor] = useState<ManagedLesson | null>(resumed?.editor ?? null);
  const [editorBase, setEditorBase] = useState(resumed?.editorBase ?? "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(resumed ? "Вы вернулись к паре. Ввод и правки недели восстановлены. Проверьте преподавателя перед применением." : "");
  const [busy, setBusy] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [discard, setDiscard] = useState<"lesson" | "week" | null>(null);
  const [discardError, setDiscardError] = useState("");
  const [removedLesson, setRemovedLesson] = useState<ManagedLesson | null>(resumed?.removedLesson ?? null);
  const dirty = saved !== JSON.stringify(lessons);
  const editorDirty = Boolean(editor && JSON.stringify(editor) !== editorBase);
  const dirtyRef = useRef(dirty || editorDirty);
  dirtyRef.current = dirty || Boolean(editor);
  const scopeRef = useRef(scope);
  const editingId = editor?.id;
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const weekActionRef = useRef<HTMLButtonElement | null>(null);
  const listHeadingRef = useRef<HTMLDivElement | null>(null);
  const weekToolsRef = useRef<HTMLDetailsElement>(null);
  const blocksNavigation = useCallback<UnsavedNavigationCheck>((transition) => changesLocation(transition) && !handoff.permitsAssignmentNavigation(transition), [handoff]);
  useUnsavedChangesWarning(dirty || editorDirty || busy, blocksNavigation);

  useEffect(() => { if (resumed) handoff.clear(); }, [handoff, resumed]);

  useEffect(() => subscribeManagedSchedule(() => setState(readManagedScheduleState())), []);
  useEffect(() => subscribeAccounts(() => setTeachers(getManagedScheduleTeachers())), []);
  useEffect(() => {
    if (editingId || !returnFocusRef.current) return;
    const previous = returnFocusRef.current;
    const target = previous.isConnected && !previous.matches(":disabled") ? previous : listHeadingRef.current;
    target?.focus();
    returnFocusRef.current = null;
  }, [editingId]);
  useEffect(() => {
    if (catalogError) return;
    const changedScope = scopeRef.current !== scope;
    if (validScope && !changedScope && dirtyRef.current) return;
    scopeRef.current = scope;
    const next = getManagedScheduleWeek(state.snapshot, weekStart, groupId);
    setLessons(next.lessons);
    setSaved(JSON.stringify(next.lessons));
    setRevision(state.snapshot.revision);
    setEditor(null);
    setRemovedLesson(null);
    if (changedScope || !validScope) { setCopyOpen(false); setConfirmPublish(false); setDiscard(null); }
    setError("");
    if (changedScope) setMessage("");
  }, [scope, groupId, weekStart, state.snapshot, validScope, catalogError]);

  const conflicts = useMemo(() => validScope && !catalogError && !state.error ? getManagedWeekConflicts(state.snapshot, { weekStart, groupId, lessons }) : [], [state.snapshot, state.error, weekStart, groupId, lessons, validScope, catalogError]);
  const hasDraft = state.snapshot.drafts.some((week) => week.weekStart === weekStart && week.groupId === groupId);
  const published = state.snapshot.published.find((week) => week.weekStart === weekStart && week.groupId === groupId);
  const stale = revision !== state.snapshot.revision;
  const selectedGroup = ACADEMIC_GROUPS.find((group) => group.id === groupId);
  const archived = Boolean(selectedGroup && !isGroupActive(selectedGroup));
  const blocked = busy || !validScope || Boolean(state.error) || Boolean(catalogError) || currentUser.role !== "configurator" || archived;
  const actionState = getWeekActionState({ dirty, editorOpen: Boolean(editor), hasDraft, published: Boolean(published), conflicts: conflicts.length, stale, busy, blockedReason: state.error ? "Расписание недоступно. Сначала восстановите чтение данных." : catalogError ? "Каталог недоступен. Повторите чтение перед сохранением." : currentUser.role !== "configurator" ? "Изменение расписания доступно настройщику." : archived ? "Группа в архиве. Расписание доступно для просмотра." : "" });
  const days = useMemo(() => groupScheduleLessons(lessons), [lessons]);
  const conflictingIds = new Set(conflicts.flatMap((conflict) => [conflict.lessonId, conflict.otherId]));
  const closeWeekTools = () => { weekToolsRef.current?.removeAttribute("open"); weekToolsRef.current?.querySelector("summary")?.focus(); };
  const updateScope = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); next.set(key, value); return next; });
  const startEditing = (lesson?: ManagedLesson) => {
    if (editorDirty) { setError("Сначала добавьте изменения текущей пары в неделю или отмените редактирование."); return; }
    const next = lesson ? { ...lesson } : freshLesson(weekStart, groupId);
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor(next); setEditorBase(JSON.stringify(next)); setError(""); setMessage("");
  };
  const submitLesson = (next: ManagedLesson) => {
    if (blocked) return;
    returnFocusRef.current = weekActionRef.current;
    const editingExisting = lessons.some((lesson) => lesson.id === next.id);
    setLessons((current) => sortLessons([...current.filter((lesson) => lesson.id !== next.id), next]));
    setEditor(null); setError(""); setMessage(editingExisting ? "Правки пары применены к рабочей неделе. Сохраните черновик, затем опубликуйте." : "Пара добавлена в рабочую неделю. Сохраните черновик, затем опубликуйте.");
  };
  const save = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const snapshot = await saveManagedScheduleDraft({ actorId: currentUser.id, expectedRevision: revision, weekStart, groupId, lessons });
      dirtyRef.current = false; setState({ snapshot, error: "" }); setRevision(snapshot.revision); setSaved(JSON.stringify(lessons));
      setRemovedLesson(null);
      setMessage("Черновик сохранён. Студенты и преподаватели увидят изменения после публикации.");
    } catch (caught) { console.error("Не удалось сохранить черновик расписания:", caught); setError(caught instanceof Error ? caught.message : "Не удалось сохранить черновик."); }
    finally { setBusy(false); }
  };
  const reset = () => {
    const latest = readManagedScheduleState();
    if (latest.error) { setDiscardError(latest.error); setError(latest.error); setState((previous) => ({ ...previous, error: latest.error })); return false; }
    dirtyRef.current = false;
    const next = getManagedScheduleWeek(latest.snapshot, weekStart, groupId);
    setState(latest); setLessons(next.lessons); setSaved(JSON.stringify(next.lessons)); setRevision(latest.snapshot.revision); setEditor(null); setError(""); setMessage("");
    setRemovedLesson(null); return true;
  };
  const requestReset = () => { setDiscardError(""); if (dirty || editorDirty) setDiscard("week"); else reset(); };
  const cancelLesson = () => { setDiscardError(""); if (editorDirty) setDiscard("lesson"); else setEditor(null); };
  const undoRemoval = () => {
    if (!removedLesson || blocked || stale) return;
    try { setLessons(restoreRemovedScheduleLesson(lessons, removedLesson)); setRemovedLesson(null); setMessage("Пара возвращена в рабочую неделю."); }
    catch (failure) { console.error("Не удалось вернуть убранную пару:", failure); setError(failure instanceof Error ? failure.message : "Не удалось вернуть пару."); }
  };
  const configureAssignment = () => {
    if (!editor || blocked || !editor.subjectId) return;
    try {
      const returnParams = new URLSearchParams(params);
      returnParams.delete(SCHEDULE_RETURN_PARAM);
      returnParams.set("group", groupId); returnParams.set("date", weekStart);
      const destination = handoff.begin({ weekStart, groupId, returnSearch: returnParams.toString(), historySearch: params.toString(), lessons, saved, revision, editor, editorBase, removedLesson }, crypto.randomUUID());
      navigate(destination);
    } catch (failure) {
      console.error("Не удалось сохранить ввод пары перед переходом к назначениям:", failure);
      handoff.clear();
      setError("Не удалось перейти к назначениям. Все правки остались в редакторе — повторите попытку.");
    }
  };

  if (!validScope) return <div className={`pageContainer ${styles.page}`}><section className={styles.empty} aria-label="Выбор области расписания"><h2>Проверьте группу и неделю</h2>{catalogError ? <p role="alert">{catalogError} Введённые правки остаются в памяти открытого редактора.</p> : <div role="alert">{selection.errors.group && <p>{selection.errors.group}</p>}{selection.errors.date && <p>{selection.errors.date}</p>}</div>}<p>Редактор откроется после выбора корректной области. Другая группа или дата не подставляются вместо ошибочной ссылки.</p>{catalogError ? <button type="button" onClick={refreshCatalog}>Повторить чтение каталога</button> : <><Dropdown searchable label="Учебная группа" value={groupId} placeholder="" options={ACADEMIC_GROUPS.map((group) => ({ value: group.id, label: `${group.name}${isGroupActive(group) ? "" : " · В архиве"}` }))} onChange={(value) => updateScope("group", value)} />{selection.errors.date && <button type="button" onClick={() => updateScope("date", getManagedWeekKey(toLocalDateKey(new Date())))}>Выбрать текущую неделю</button>}</>}</section></div>;

  return <div className={`pageContainer ${styles.page} ${editor ? styles.editing : ""}`}>
    <div className={styles.navigation}><WeekPicker value={parseCalendarDate(weekStart)} onWeekChange={(date) => updateScope("date", toLocalDateKey(date))} /></div>
    <section className={styles.weekPanel} aria-label="Рабочая неделя">
      <div className={styles.scopeRow}>
        <Dropdown searchable label="Учебная группа" value={groupId} placeholder="" options={ACADEMIC_GROUPS.filter((group) => isGroupActive(group) || group.id === groupId).map((group) => ({ value: group.id, label: `${group.name}${isGroupActive(group) ? "" : " · В архиве"}` }))} onChange={(value) => updateScope("group", value)} disabled={busy} />
        <details ref={weekToolsRef} className={styles.weekTools}>
          <summary>Действия недели</summary>
          <div className={styles.weekToolsContent}>
            <button type="button" disabled={blocked || Boolean(editor) || stale} onClick={() => { closeWeekTools(); setCopyOpen(true); }}>Копировать из другой недели</button>
            {(dirty || editorDirty) && <button className={styles.reset} type="button" disabled={busy} onClick={() => { closeWeekTools(); requestReset(); }}>Сбросить правки недели</button>}
            <p>Копирование заменит рабочий список после проверки. Публикация выполняется отдельно.</p>
          </div>
        </details>
      </div>
      <div className={styles.workflow} aria-label="Состояние и сохранение недели">
        <div className={styles.workflowText}>
          <div className={styles.statusLine}><strong className={`${styles.statusBadge} ${dirty || editorDirty ? styles.unsaved : ""}`}>{actionState.status}</strong>{published && (dirty || hasDraft || editor) && <span>Есть опубликованная версия</span>}</div>
          <p id="week-action-hint">{actionState.hint}</p>
        </div>
        <button ref={weekActionRef} className={styles.primary} type="button" aria-describedby="week-action-hint" disabled={actionState.disabled} onClick={() => { if (actionState.action === "save") void save(); else setConfirmPublish(true); }}>{actionState.label}</button>
      </div>
    </section>
    {state.error && <div role="alert" className={styles.error}>{state.error}</div>}
    {catalogError && <div role="alert" className={styles.error}><span>{catalogError}</span><button type="button" onClick={refreshCatalog}>Повторить чтение</button></div>}
    {stale && <div role="alert" className={styles.error}><span>Расписание изменено в другой вкладке. Ваши правки остаются в рабочем списке.</span><button type="button" disabled={busy} onClick={requestReset}>Загрузить актуальную неделю</button></div>}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {message && <p role="status" className={styles.message}>{message}</p>}
    {params.has(SCHEDULE_RETURN_PARAM) && !resumed && <p role="status" className={styles.error}>Временный ввод пары недоступен: страница была перезагружена или пользователь изменился. Открыта сохранённая неделя.</p>}
    {removedLesson && <div className={styles.undo} role="status"><span>Убрана пара: {getAcademicSubjectDefinition(removedLesson.subjectId)?.name ?? "Дисциплина"}, {parseCalendarDate(removedLesson.date)?.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} в {removedLesson.startsAt}.</span><button type="button" disabled={blocked || stale || Boolean(editor)} onClick={undoRemoval}>Вернуть пару</button></div>}
    {conflicts.length > 0 && <details className={styles.conflicts}>
      <summary>Конфликты: {conflicts.length} · нужно исправить перед публикацией</summary>
      <ul>{conflicts.map((conflict, index) => {
        const lesson = lessons.find((entry) => entry.id === conflict.lessonId || entry.id === conflict.otherId);
        return <li key={`${conflict.lessonId}:${conflict.otherId}:${conflict.kind}:${index}`}><span>{conflict.message}</span>{lesson && <button type="button" disabled={blocked || Boolean(editor)} onClick={() => startEditing(lesson)}>Исправить пару</button>}</li>;
      })}</ul><p>Черновик можно сохранить с конфликтами. При публикации проверяются преподаватели, группы и аудитории.</p>
    </details>}
    <div className={`${styles.workspace} ${editor ? styles.withEditor : ""}`}>
      {editor && <LessonEditor key={editor.id} value={editor} groupName={selectedGroup?.name ?? groupId} weekStart={weekStart} editing={lessons.some((lesson) => lesson.id === editor.id)} blocked={blocked} busy={busy} blockedMessage={blocked ? actionState.hint : ""} subjects={subjects.filter((subject) => getSubjectGroups(subject.id).some((group) => group.id === groupId)).map((subject) => ({ value: subject.id, label: subject.name, searchText: subject.shortName }))} teachers={teachers} onChange={setEditor} onApply={submitLesson} onCancel={cancelLesson} onConfigureAssignment={configureAssignment} />}
      <section aria-label="Занятия недели" className={styles.lessons}>
        <div ref={listHeadingRef} tabIndex={-1} className={styles.listHeading}><strong>{formatCount(lessons.length, ["занятие", "занятия", "занятий"])}</strong><button type="button" disabled={blocked || Boolean(editor)} onClick={() => startEditing()}>Добавить пару</button></div>
        {lessons.length === 0 ? <div className={styles.empty}><strong>В этой неделе пока нет пар</strong><p>Добавьте первую пару кнопкой выше или перенесите расписание через «Действия недели».</p></div> : days.map((day) => <section key={day.date} className={styles.day} aria-label={parseCalendarDate(day.date)?.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}>
          <h2 className={styles.dayHeading}>{parseCalendarDate(day.date)?.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}<span>{day.lessons.length}</span></h2>
          {day.lessons.map((lesson) => <article key={lesson.id} className={`${styles.card} ${editor?.id === lesson.id ? styles.selectedCard : ""}`}>
            <div className={styles.time}><strong>{lesson.startsAt}</strong><span>до {lesson.endsAt}</span></div>
            <div className={styles.details}><strong>{getAcademicSubjectDefinition(lesson.subjectId)?.name ?? "Дисциплина недоступна"}</strong><div className={styles.lessonMeta}><span>{lessonTypeLabels[lesson.type]}</span><span>Ауд. {lesson.room}</span>{conflictingIds.has(lesson.id) && <span className={styles.conflictBadge}>Конфликт</span>}{editor?.id === lesson.id && <span className={styles.editBadge}>Редактируется</span>}</div><span className={styles.teacherName}>{lesson.teacherName}</span></div>
            <div className={styles.cardActions}><button type="button" disabled={blocked || Boolean(editor)} onClick={() => startEditing(lesson)}>Изменить</button><button className={styles.remove} type="button" disabled={blocked || Boolean(editor)} onClick={() => { setRemovedLesson({ ...lesson }); setLessons((current) => current.filter((entry) => entry.id !== lesson.id)); setMessage("Пара убрана из рабочей недели. В опубликованном расписании она останется до следующей публикации."); }}>Убрать</button></div>
          </article>)}
        </section>)}
      </section>
    </div>
    <details className={styles.help}><summary>Как сохраняются изменения</summary><ol><li>Примените изменения пары к рабочей неделе.</li><li>Сохраните черновик — он ещё не виден студентам и преподавателям.</li><li>Проверьте изменения и отдельно подтвердите публикацию.</li></ol><p>Публикуется только выбранная группа и неделя. Пустая опубликованная неделя уберёт её занятия из расписания.</p></details>
    {discard && <ConfirmDialog title={discard === 'lesson' ? 'Отменить правки этой пары?' : 'Сбросить все правки недели?'} confirmLabel={discard === 'lesson' ? 'Отменить правки пары' : 'Сбросить правки недели'} cancelLabel="Продолжить редактирование" error={discardError} onCancel={() => { setDiscard(null); setDiscardError(''); }} onConfirm={() => { if (discard === 'lesson') { setEditor(null); setDiscard(null); } else if (reset()) setDiscard(null); }}><p>{discard === 'lesson' ? 'Изменения открытой пары будут отменены. Остальные правки рабочей недели сохранятся.' : 'Изменения рабочей недели и открытой формы будут заменены последним сохранённым состоянием. Сохранённые публикации и отметки журнала не изменятся.'}</p></ConfirmDialog>}
    {copyOpen && <CopyWeekDialog key={scope} snapshot={state.snapshot} groupId={groupId} groupName={ACADEMIC_GROUPS.find((group) => group.id === groupId)?.name ?? groupId} targetWeekStart={weekStart} currentLessonCount={lessons.length} hasUnsavedChanges={dirty} onClose={() => setCopyOpen(false)} onApply={(copied) => { dirtyRef.current = true; setLessons(sortLessons(copied)); setRemovedLesson(null); setCopyOpen(false); setError(""); setMessage("Копия перенесена в рабочую неделю. Проверьте занятия, сохраните черновик и опубликуйте отдельно."); }} />}
    {confirmPublish && <PublicationReview key={scope} groupId={groupId} groupName={ACADEMIC_GROUPS.find((group) => group.id === groupId)?.name ?? groupId} weekStart={weekStart} revision={revision} onClose={() => setConfirmPublish(false)} onPublished={(snapshot) => { const publishedLessons = getManagedScheduleWeek(snapshot, weekStart, groupId).lessons; dirtyRef.current = false; setLessons(publishedLessons); setSaved(JSON.stringify(publishedLessons)); setState({ snapshot, error: "" }); setRevision(snapshot.revision); setRemovedLesson(null); setConfirmPublish(false); setError(""); setMessage("Неделя опубликована. Расписание и новые занятия журнала обновлены."); }} />}
  </div>;
};

export default AdminSchedulePage;
