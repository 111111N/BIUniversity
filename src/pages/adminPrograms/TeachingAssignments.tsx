import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Card from "../../components/Card";
import Dropdown from "../../components/Dropdown";
import Checkbox from "../../components/Checkbox";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import useTeachingAssignments from "../../hooks/useTeachingAssignments";
import { teachingAssignmentsService } from "../../data/teachingAssignmentsStore";
import { findTeachingAssignment, sameTeachingData, type TeachingAssignment, type TeachingAssignmentCommand, type TeachingAssignmentContext } from "../../domain/teachingAssignments";
import { lessonTypeLabels, type LessonType } from "../../domain/academic";
import { assessmentPeriodLabel } from "../../domain/assessmentPeriods";
import { formatAcademicDay } from "../../domain/academicCalendarMath";
import { isAccountActive } from "../../domain/accounts";
import TeachingHistory from "./TeachingHistory";
import TeachingWorkload from "../../components/TeachingWorkload";
import styles from "./index.module.scss";

type Draft = Pick<TeachingAssignmentCommand, "mode" | "periods">;
interface Editor { context: TeachingAssignmentContext; revision: number; draft: Draft; before: Draft }
function TeachingWorkspace({ actorId }: { actorId: string }) {
  const source = useTeachingAssignments(actorId), snapshot = source.snapshot;
  const [params, setParams] = useSearchParams(), teacherId = params.get("teacher") ?? "", subjectId = params.get("subject") ?? "", groupId = params.get("group") ?? "", scope = JSON.stringify([teacherId, subjectId, groupId]);
  const [editor, setEditor] = useState<Editor | null>(null), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [page, setPage] = useState(1);
  const pending = useRef(false), generation = useRef(0), { requestAction } = useUnsavedChangesGuard();
  useEffect(() => { generation.current++; setEditor(null); setError(""); setMessage(""); setPage(1); }, [scope]);
  useEffect(() => () => { generation.current++; }, []);
  const teacher = snapshot?.teachers.find(row => row.id === teacherId), subject = snapshot?.subjects.find(row => row.id === subjectId), group = snapshot?.groups.find(row => row.id === groupId);
  const membership = teacher?.memberships.find(row => row.subjectId === subjectId), availableGroupIds = membership?.groupIds ?? [];
  const assignment = snapshot ? findTeachingAssignment(snapshot, teacherId, subjectId, groupId) : undefined;
  const outdatedPeriods = Boolean(assignment?.periods.some(entry => !sameTeachingData(entry.period.term, snapshot?.terms.find(row => row.id === entry.period.term.id)) || !sameTeachingData(entry.period.year, snapshot?.years.find(row => row.id === entry.period.year.id))));
  const dirty = Boolean(editor && (!sameTeachingData(editor.draft, editor.before) || outdatedPeriods)), stale = Boolean(editor && snapshot && !sameTeachingData(editor.context, snapshot.context));
  const selected = Boolean(teacher && subject && group && availableGroupIds.includes(groupId));
  const unavailable = source.loading || Boolean(source.error) || !selected || group?.status === "archived" || subject?.status === "archived";
  useUnsavedChangesWarning(dirty || busy);
  const selection = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); if (key !== "group") next.delete("group"); return next; });
  const open = () => {
    if (!snapshot || unavailable) return;
    const draft: Draft = { mode: assignment?.mode ?? "general", periods: (assignment?.periods ?? []).map(entry => ({ termId: entry.period.term.id, types: [...entry.types] })) };
    generation.current++; setError(""); setMessage(""); setPage(1); setEditor({ context: snapshot.context, revision: assignment?.revision ?? 0, draft, before: structuredClone(draft) });
  };
  const review = async () => {
    if (!editor || pending.current) return;
    const request = ++generation.current; pending.current = true; setBusy(true); setError("");
    try {
      const latest = await teachingAssignmentsService.read(actorId);
      if (request !== generation.current) return;
      const record = latest.assignments.find(row => row.teacherId === teacherId && row.subjectId === subjectId && row.groupId === groupId);
      if ((record?.revision ?? 0) !== editor.revision) throw new Error("Само назначение изменилось. Откройте его заново; ввод пока сохранён.");
      setEditor({ ...editor, context: latest.context }); source.refresh();
    } catch (failure) { console.error("Не удалось перепроверить назначение:", failure); if (request === generation.current) setError(failure instanceof Error ? failure.message : "Проверка недоступна."); }
    finally { pending.current = false; setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!editor || unavailable || stale || pending.current || !dirty) return;
    const request = ++generation.current; pending.current = true; setBusy(true); setError("");
    try {
      await teachingAssignmentsService.execute({ ...editor.context, teacherId, subjectId, groupId, assignmentRevision: editor.revision, ...editor.draft });
      if (request === generation.current) { setEditor(null); setMessage("Назначение сохранено. Расписание и журнал учитывают типы занятий и семестр."); }
    } catch (failure) { console.error("Не удалось сохранить назначение:", failure); if (request === generation.current) setError(failure instanceof Error ? failure.message : "Назначение не сохранено. Ввод сохранён."); }
    finally { pending.current = false; setBusy(false); }
  };
  const patchPeriod = (index: number, patch: Partial<Draft["periods"][number]>) => setEditor(previous => previous ? { ...previous, draft: { ...previous.draft, periods: previous.draft.periods.map((row, i) => i === index ? { ...row, ...patch } : row) } } : previous);
  const close = () => { if (!busy) requestAction(() => { generation.current++; setEditor(null); setError(""); }); };
  const pages = Math.max(1, Math.ceil((editor?.draft.periods.length ?? assignment?.periods.length ?? 0) / 20)), currentPage = Math.min(page, pages), offset = (currentPage - 1) * 20;
  const readPeriods = (record: TeachingAssignment) => record.periods.slice(offset, offset + 20).map(entry => <div className={styles.rowEditor} key={entry.period.term.id}><strong>{assessmentPeriodLabel(entry.period)}</strong><span>{formatAcademicDay(entry.period.term.startsOn)} — {formatAcademicDay(entry.period.term.endsOn)}</span><span>{entry.types.map(type => lessonTypeLabels[type]).join(", ")}</span></div>);
  return <div className={`pageContainer ${styles.page}`}><nav className={styles.actions} aria-label="Назначения преподавателей"><Link to={`/admin/subjects${subjectId ? `?subject=${encodeURIComponent(subjectId)}` : ""}`}>Общие назначения</Link><Link to="/admin/curricula">Учебные планы</Link><Link to="/admin/periods">Учебные периоды</Link></nav>
    <Card className={styles.toolbar}><h1>Преподаватели по типам занятий</h1><div className={styles.hourGrid}>
      <Dropdown label="Преподаватель" searchable value={teacherId} disabled={busy || source.loading} options={(snapshot?.teachers ?? []).map(row => ({ value: row.id, label: `${row.name} · ${row.login}${isAccountActive(row) ? "" : " (доступ заблокирован)"}` }))} onChange={value => selection("teacher", value)} />
      <Dropdown label="Дисциплина" searchable value={subjectId} disabled={busy || source.loading} options={(snapshot?.subjects ?? []).filter(row => teacher?.memberships.some(entry => entry.subjectId === row.id)).map(row => ({ value: row.id, label: row.name }))} onChange={value => selection("subject", value)} />
      <Dropdown label="Группа" searchable value={groupId} disabled={busy || source.loading} options={(snapshot?.groups ?? []).filter(row => availableGroupIds.includes(row.id)).map(row => ({ value: row.id, label: `${row.name}${row.status === "archived" ? " (архив)" : ""}` }))} onChange={value => selection("group", value)} />
    </div><p className={styles.note}>Сначала задайте дисциплину и группы в общем назначении. Здесь можно уточнить семестры и типы занятий. Исторические журналы остаются доступны для просмотра.</p></Card>
    {source.loading && <p role="status">Загружаем назначения…</p>}{(source.error || error) && <p className={styles.error} role="alert">{source.error || error}</p>}{message && <p role="status">{message}</p>}
    {outdatedPeriods && <p role="status">Реквизиты семестра изменились после сохранения назначения. Откройте редактор и сохраните актуальные снимки; прежний вариант останется в истории.</p>}
    {!selected && !source.loading && !source.error && <Card className={styles.card}><p>Выберите преподавателя, его дисциплину и группу. Если назначения ещё нет, добавьте его в разделе «Общие назначения».</p></Card>}
    {selected && !editor && <Card className={styles.card}><h2>{teacher?.name} · {group?.name}</h2><p>{subject?.name}</p><strong>{assignment?.mode === "periods" ? "По семестрам и типам занятий" : "Общее назначение: все типы, без ограничения периода"}</strong>{assignment?.mode === "periods" && (assignment.periods.length ? readPeriods(assignment) : <p>Разрешённых семестров нет. Новые занятия и изменение отметок недоступны.</p>)}<button type="button" disabled={unavailable || busy} onClick={open}>Изменить типы и семестры</button></Card>}
    {editor && <RecordEditor title="Типы занятий и семестры" dirty={dirty} busy={busy} onClose={close}><form className={styles.form} onSubmit={save}>
      {stale && <div className={styles.error}><p>Источники изменились. Перепроверьте форму перед сохранением.</p><button type="button" disabled={busy} onClick={() => void review()}>Перепроверить</button></div>}
      <Dropdown label="Вид назначения" value={editor.draft.mode} disabled={busy || unavailable} options={[{ value: "general", label: "Все типы без ограничения периода" }, { value: "periods", label: "По семестрам и типам занятий" }]} onChange={mode => { setPage(1); setEditor({ ...editor, draft: { mode: mode as Draft["mode"], periods: [] } }); }} />
      {editor.draft.mode === "periods" && <><p className={styles.note}>Вне указанных семестров новые пары и изменение отметок недоступны. Пустой список снимает эти права, сохраняя просмотр истории.</p>
        {editor.draft.periods.slice(offset, offset + 20).map((entry, localIndex) => { const index = offset + localIndex; return <fieldset key={index} className={styles.rowEditor} disabled={busy || unavailable}><legend>Семестр {index + 1}</legend>
          <Dropdown label="Учебный год и семестр" searchable value={entry.termId} options={(snapshot?.terms ?? []).filter(row => row.id === entry.termId || !editor.draft.periods.some(other => other.termId === row.id)).map(row => ({ value: row.id, label: `${snapshot?.years.find(year => year.id === row.yearId)?.name ?? ""} · ${row.name}` }))} onChange={termId => patchPeriod(index, { termId })} />
          <div className={styles.checks}>{(Object.keys(lessonTypeLabels) as LessonType[]).map(type => <Checkbox key={type} label={lessonTypeLabels[type]} checked={entry.types.includes(type)} disabled={busy || unavailable} onChange={checked => patchPeriod(index, { types: checked ? [...entry.types, type] : entry.types.filter(value => value !== type) })} />)}</div>
          <button type="button" onClick={() => setEditor({ ...editor, draft: { ...editor.draft, periods: editor.draft.periods.filter((_, i) => i !== index) } })}>Убрать семестр</button>
        </fieldset>; })}
        <div className={styles.actions}><button type="button" disabled={busy || unavailable || editor.draft.periods.length >= 200} onClick={() => { const rows = [...editor.draft.periods, { termId: "", types: [] }]; setEditor({ ...editor, draft: { ...editor.draft, periods: rows } }); setPage(Math.ceil(rows.length / 20)); }}>Добавить семестр</button></div>
      </>}
      <RecordEditorActions label="Сохранить назначение" disabled={busy || unavailable || stale || !dirty} busy={busy} onCancel={() => { if (!busy) requestAction(() => { generation.current++; setEditor(null); setError(""); }); }} hint="Будущие опубликованные занятия проверяются перед сохранением." />
    </form></RecordEditor>}
    {pages > 1 && <nav className={styles.actions} aria-label="Страницы семестров назначения"><button type="button" disabled={currentPage <= 1 || busy} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages || busy} onClick={() => setPage(currentPage + 1)}>Далее</button></nav>}
    {assignment && snapshot && !editor && <TeachingHistory key={`${assignment.id}:${assignment.revision}`} context={snapshot.context} id={assignment.id} />}
    {teacher && !editor && <TeachingWorkload key={teacher.id} teacherId={teacher.id} />}
  </div>;
}
export default function TeachingAssignmentsPage() { const { currentUser } = useRole(); return <TeachingWorkspace key={currentUser.id} actorId={currentUser.id} />; }
