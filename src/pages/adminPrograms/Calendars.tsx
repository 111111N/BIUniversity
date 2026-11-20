import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Card from "../../components/Card";
import Dropdown from "../../components/Dropdown";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import useGroupCalendars from "../../hooks/useGroupCalendars";
import { groupCalendarsService } from "../../data/groupCalendarsStore";
import type { CalendarContents, GroupCalendar, GroupCalendarContext } from "../../domain/groupCalendarTypes";
import { sameCurriculumData } from "../../domain/curricula";
import { formatAcademicDay } from "../../domain/academicCalendarMath";
import CalendarContentsEditor, { CalendarOverview } from "./CalendarContents";
import CalendarCopyDialog from "./CalendarCopyDialog";
import CalendarHistory from "./CalendarHistory";
import styles from "./index.module.scss";

interface Editor { context: GroupCalendarContext; calendarRevision: number; contents: CalendarContents; before: CalendarContents; mode: "edit" | "close" | "reopen"; reason: string; period: GroupCalendar["period"] }
function CalendarsWorkspace({ actorId }: { actorId: string }) {
  const source = useGroupCalendars(actorId), snapshot = source.snapshot;
  const [params, setParams] = useSearchParams(), groupId = params.get("group") ?? "", termId = params.get("term") ?? "", scope = JSON.stringify([groupId, termId]);
  const [editor, setEditor] = useState<Editor | null>(null), [copyOpen, setCopyOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const pending = useRef(false), generation = useRef(0), { requestAction } = useUnsavedChangesGuard();
  useEffect(() => { generation.current++; setEditor(null); setCopyOpen(false); setError(""); setMessage(""); }, [scope]);
  const group = snapshot?.groups.find(row => row.id === groupId), term = snapshot?.terms.find(row => row.id === termId), year = snapshot?.years.find(row => row.id === term?.yearId);
  const calendar = snapshot?.calendars.find(row => row.group.id === groupId && row.period.term.id === termId);
  const period = snapshot && term && year ? { catalogRevision: snapshot.context.periodsRevision, year, term } : undefined;
  const dirty = Boolean(editor && (editor.mode !== "edit" ? editor.reason.length > 0 : !sameCurriculumData(editor.contents, editor.before)));
  useUnsavedChangesWarning(dirty || busy);
  const stale = Boolean(editor && snapshot && !sameCurriculumData(editor.context, snapshot.context));
  const blocked = busy || source.loading || Boolean(source.error) || !group || !period || stale;
  const archived = Boolean(snapshot?.archivedGroupIds.includes(groupId));
  const open = (mode: Editor["mode"]) => {
    if (!snapshot || !period || !group || source.loading || source.error || mode === "edit" && (archived || calendar?.state === "closed") || mode !== "edit" && !calendar) return;
    const contents = structuredClone({ segments: calendar?.segments ?? [], daysOff: calendar?.daysOff ?? [] });
    generation.current++; setError(""); setMessage(""); setEditor({ context: snapshot.context, calendarRevision: calendar?.revision ?? 0, contents, before: structuredClone(contents), mode, reason: "", period: mode === "edit" ? period : calendar!.period });
  };
  const close = () => { if (!busy) requestAction(() => { generation.current++; setEditor(null); setError(""); }); };
  const review = async () => {
    if (!editor || pending.current) return;
    const request = ++generation.current; pending.current = true; setBusy(true); setError("");
    try {
      const latest = await groupCalendarsService.read(actorId);
      if (generation.current !== request) return;
      const record = latest.calendars.find(row => row.group.id === groupId && row.period.term.id === termId), nextTerm = latest.terms.find(row => row.id === termId), nextYear = latest.years.find(row => row.id === nextTerm?.yearId);
      if ((record?.revision ?? 0) !== editor.calendarRevision || !nextTerm || !nextYear) throw new Error("Сам календарь или период изменился. Ввод сохранён; откройте актуальную карточку заново.");
      setEditor({ ...editor, context: latest.context, period: editor.mode === "edit" ? { catalogRevision: latest.context.periodsRevision, year: nextYear, term: nextTerm } : editor.period }); source.refresh();
    } catch (failure) { console.error("Не удалось перепроверить календарь:", failure); setError(failure instanceof Error ? failure.message : "Проверка недоступна. Ввод сохранён."); }
    finally { pending.current = false; setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!editor || blocked || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      if (editor.mode === "edit") await groupCalendarsService.execute({ ...editor.context, type: "save", groupId, termId, calendarRevision: editor.calendarRevision, contents: editor.contents });
      else if (calendar) await groupCalendarsService.execute({ ...editor.context, type: editor.mode, calendarId: calendar.id, calendarRevision: editor.calendarRevision, reason: editor.reason });
      else throw new Error("Сначала создайте календарь периода.");
      setMessage(editor.mode === "close" ? "Период закрыт. Редактирование учебных данных заблокировано." : editor.mode === "reopen" ? "Период переоткрыт. Причина сохранена в истории." : "Учебный календарь сохранён."); setEditor(null);
    } catch (failure) { console.error("Не удалось сохранить учебный календарь:", failure); setError(failure instanceof Error ? failure.message : "Изменение недоступно. Ввод сохранён."); }
    finally { pending.current = false; setBusy(false); }
  };
  const selection = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); return next; });
  return <div className={`pageContainer ${styles.page}`}><nav className={styles.actions} aria-label="Учебные справочники"><Link to="/admin/programs">Программы и формы</Link><Link to="/admin/curricula">Учебные планы</Link><Link to="/admin/periods">Учебные периоды</Link>{groupId && <Link to={`/admin/groups?group=${encodeURIComponent(groupId)}`}>К группе</Link>}</nav>
    <Card className={styles.toolbar}><div className={styles.hourGrid}><Dropdown label="Группа" value={groupId} options={(snapshot?.groups ?? []).map(row => ({ value: row.id, label: `${row.name}${snapshot?.archivedGroupIds.includes(row.id) ? " (архив)" : ""}` }))} disabled={busy || source.loading} searchable onChange={value => selection("group", value)} /><Dropdown label="Учебный год и семестр" value={termId} options={(snapshot?.terms ?? []).map(row => ({ value: row.id, label: `${snapshot?.years.find(item => item.id === row.yearId)?.name ?? ""} · ${row.name}` }))} disabled={busy || source.loading} searchable onChange={value => selection("term", value)} /></div></Card>
    {source.loading && <p role="status">Загрузка календарей…</p>}{source.error && <p role="alert" className={styles.error}>{source.error} <button type="button" onClick={source.refresh}>Повторить чтение</button></p>}{error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status">{message}</p>}
    {editor ? <RecordEditor title={`${group?.name ?? "Группа"} · ${editor.period.year.name} · ${editor.period.term.name}`} context={editor.mode === "edit" ? "Редактирование календаря" : editor.mode === "close" ? "Закрытие периода" : "Переоткрытие периода"} dirty={dirty} busy={busy} onClose={close}>
      {stale && <p role="alert" className={styles.error}>Данные или права изменились. Ввод сохранён. <button type="button" disabled={busy} onClick={() => void review()}>Обновить проверку</button></p>}
      <p>{formatAcademicDay(editor.period.term.startsOn)} — {formatAcademicDay(editor.period.term.endsOn)}</p>
      <form className={styles.form} onSubmit={event => void save(event)}>{editor.mode === "edit" ? <CalendarContentsEditor contents={editor.contents} period={editor.period} disabled={blocked || archived} onChange={contents => setEditor({ ...editor, contents })} /> : <><p>{editor.mode === "close" ? "Сохранение и публикация расписания, изменение ведомостей и отметок журнала этого периода будут запрещены. Уже сохранённые данные останутся доступны для чтения." : "После переоткрытия снова можно будет изменять учебные данные периода. Причина и время действия останутся в истории."}</p><label className={styles.field}>{editor.mode === "reopen" ? "Причина переоткрытия" : "Комментарий (необязательно)"}<input required={editor.mode === "reopen"} minLength={editor.mode === "reopen" ? 5 : undefined} maxLength={1000} value={editor.reason} disabled={blocked} onChange={event => setEditor({ ...editor, reason: event.target.value })} /></label></>}
        <RecordEditorActions label={editor.mode === "edit" ? "Сохранить календарь" : editor.mode === "close" ? "Закрыть период" : "Переоткрыть период"} disabled={blocked || editor.mode === "edit" && archived || editor.mode === "reopen" && editor.reason.trim().length < 5} busy={busy} onCancel={close} />
      </form>
    </RecordEditor> : group && period ? <Card className={styles.card}><div className={styles.actions}><h2>{group.name} · {period.year.name} · {period.term.name}</h2><strong>{calendar?.state === "closed" ? "Закрыт" : "Открыт"}</strong></div><p>{formatAcademicDay((calendar?.period ?? period).term.startsOn)} — {formatAcademicDay((calendar?.period ?? period).term.endsOn)}</p>
      <div className={styles.actions}><button type="button" disabled={blocked || archived || calendar?.state === "closed"} onClick={() => open("edit")}>{calendar ? "Изменить календарь" : "Разметить календарь"}</button><button type="button" disabled={blocked || archived || calendar?.state === "closed" || !snapshot?.calendars.length} onClick={() => setCopyOpen(true)}>Скопировать из другого календаря</button>{calendar && <button type="button" disabled={blocked} onClick={() => open(calendar.state === "closed" ? "reopen" : "close")}>{calendar.state === "closed" ? "Переоткрыть период" : "Закрыть период"}</button>}</div>
      {calendar ? <><CalendarOverview contents={calendar} period={calendar.period} />{snapshot && <CalendarHistory context={snapshot.context} id={calendar.id} />}</> : <p className={styles.note}>Календарь ещё не задан. Даты не размечаются автоматически.</p>}
    </Card> : snapshot && !source.loading && <Card>Выберите группу и учебный семестр.</Card>}
    {copyOpen && snapshot && group && period && <CalendarCopyDialog snapshot={snapshot} groupId={groupId} termId={termId} onClose={() => setCopyOpen(false)} onCopied={() => { setCopyOpen(false); setMessage("Календарь скопирован. Предыдущий вариант сохранён в истории."); }} />}
  </div>;
}
export default function AdminCalendars() { const { currentUser } = useRole(); return <CalendarsWorkspace key={currentUser.id} actorId={currentUser.id} />; }
