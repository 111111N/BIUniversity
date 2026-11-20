import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import Link from "../../components/ChecksContextLink";
import Card from "../../components/Card";
import Dropdown from "../../components/Dropdown";
import SearchField from "../../components/SearchField";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import AdministrationReturnNotice from "../../components/AdministrationReturnNotice";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import useScheduleTemplates from "../../hooks/useScheduleTemplates";
import { scheduleTemplatesService } from "../../data/scheduleTemplatesStore";
import type { ScheduleTemplate, ScheduleTemplateContext } from "../../domain/scheduleTemplates";
import { getAcademicGroup } from "../../data/academicCatalog";
import { matchesSearchText } from "../../domain/search";
import { formatAcademicDay } from "../../domain/academicCalendarMath";
import styles from "../adminPrograms/index.module.scss";

function TemplateHistory({ context, id }: { context: ScheduleTemplateContext; id: string }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [response, setResponse] = useState<{ key: string; data?: Awaited<ReturnType<typeof scheduleTemplatesService.history>>; error: string } | null>(null), key = JSON.stringify([context, id, page]);
  useEffect(() => { if (!open) return; let current = true; void scheduleTemplatesService.history(context, id, page).then(data => { if (current) setResponse({ key, data, error: "" }); }).catch(error => { console.error("Не удалось загрузить историю шаблона:", error); if (current) setResponse({ key, error: error instanceof Error ? error.message : "История недоступна." }); }); return () => { current = false; }; }, [context, id, page, open, key]);
  const source = response?.key === key ? response : null;
  return <details className={styles.historyPanel} onToggle={event => setOpen(event.currentTarget.open)}><summary>История шаблона</summary>{open && <>{!source && <p role="status">Загружаем историю…</p>}{source?.error && <p role="alert">{source.error}</p>}<ol className={styles.history}>{source?.data?.items.map(event => <li key={event.id}><strong>{new Date(event.occurredAt).toLocaleString("ru-RU")} · {event.actorName}</strong><p>{event.before ? `${event.before.name} (${event.before.status === "active" ? "действует" : "архив"}) → ` : "Создан: "}{event.after.name} ({event.after.status === "active" ? "действует" : "архив"})</p></li>)}</ol>{source?.data && source.data.pages > 1 && <nav className={styles.actions} aria-label="Страницы истории шаблона"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button><span>{page} / {source.data.pages}</span><button type="button" disabled={page >= source.data.pages} onClick={() => setPage(page + 1)}>Далее</button></nav>}</>}</details>;
}
function TemplatesWorkspace({ actorId }: { actorId: string }) {
  const source = useScheduleTemplates(actorId), [params, setParams] = useSearchParams(), query = params.get("q") ?? "", status = params.get("status") ?? "active", requestedPage = Number(params.get("page") ?? "1"), page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const queryError = !["active", "archived", "all"].includes(status) || query.length > 256 || !Number.isSafeInteger(requestedPage) || requestedPage < 1 ? "Параметры списка некорректны. Сбросьте фильтры или выберите другие значения." : "";
  const [editor, setEditor] = useState<{ record: ScheduleTemplate; context: ScheduleTemplateContext; name: string } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const pending = useRef(false), generation = useRef(0), invalidate = useCallback(() => { generation.current++; }, []), { requestAction } = useUnsavedChangesGuard();
  useEffect(() => invalidate, [invalidate]);
  const dirty = Boolean(editor && editor.name !== editor.record.name), stale = Boolean(editor && source.snapshot && JSON.stringify(editor.context) !== JSON.stringify(source.snapshot.context));
  useUnsavedChangesWarning(dirty || busy);
  const rows = queryError ? [] : (source.snapshot?.templates ?? []).filter(row => (status === "all" || row.status === status) && matchesSearchText(`${row.name} ${row.source ? getAcademicGroup(row.source.groupId)?.name ?? "" : ""}`, query)).sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(rows.length / 20)), currentPage = Math.min(page, pages);
  const change = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); if (key !== "page") next.delete("page"); return next; }, { replace: true });
  const close = () => { if (!busy) requestAction(() => { invalidate(); setEditor(null); setError(""); }); };
  const run = async (type: "rename" | "archive" | "restore", record: ScheduleTemplate, event?: FormEvent) => {
    event?.preventDefault(); const context = type === "rename" ? editor?.context : source.snapshot?.context;
    if (!context || pending.current || source.loading || source.error) return;
    pending.current = true; const token = ++generation.current; setBusy(true); setError(""); setMessage("");
    try {
      await scheduleTemplatesService.execute(type === "rename" ? { ...context, type, templateId: record.id, templateRevision: record.revision, name: editor!.name } : { ...context, type, templateId: record.id, templateRevision: record.revision });
      if (generation.current === token) { setEditor(null); setMessage(type === "archive" ? "Шаблон убран в архив. Сохранённые занятия не изменены." : type === "restore" ? "Шаблон восстановлен." : "Название шаблона сохранено."); }
    } catch (failure) { console.error("Не удалось изменить шаблон:", failure); if (generation.current === token) setError(failure instanceof Error ? failure.message : "Шаблон не изменён. Ввод сохранён."); }
    finally { if (generation.current === token) { pending.current = false; setBusy(false); } }
  };
  const review = async () => {
    if (!editor || pending.current) return; pending.current = true; setBusy(true); setError(""); const token = ++generation.current;
    try { const latest = await scheduleTemplatesService.read(actorId); if (generation.current !== token) return; if (latest.templates.find(row => row.id === editor.record.id)?.revision !== editor.record.revision) throw new Error("Сам шаблон изменился. Откройте его заново; название сохранено в форме."); setEditor({ ...editor, context: latest.context }); source.refresh(); }
    catch (failure) { console.error("Не удалось перепроверить шаблон:", failure); if (generation.current === token) setError(failure instanceof Error ? failure.message : "Проверка недоступна."); }
    finally { if (generation.current === token) { pending.current = false; setBusy(false); } }
  };
  return <div className={`pageContainer ${styles.page}`}><AdministrationReturnNotice /><nav className={styles.actions}><Link to="/admin/schedule">Редактор недель</Link><Link to="/admin/schedule/overview">Обзор публикаций</Link></nav>
    {(source.error || error) && <p className={styles.error} role="alert">{source.error || error}</p>}{message && <p role="status">{message}</p>}
    {queryError && <div className={styles.error}><p role="alert">{queryError}</p><button type="button" onClick={() => setParams(previous => { const next = new URLSearchParams(previous); ["q", "status", "page"].forEach(key => next.delete(key)); return next; }, { replace: true })}>Сбросить фильтры</button></div>}
    {editor ? <RecordEditor title="Название шаблона" dirty={dirty} busy={busy} onClose={close}><form className={styles.form} onSubmit={event => void run("rename", editor.record, event)}><label className={styles.field}>Название<input required minLength={2} maxLength={160} disabled={busy} value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} /></label>{stale && <div className={styles.error}><p>Источники изменились. Перепроверьте форму.</p><button type="button" disabled={busy} onClick={() => void review()}>Перепроверить</button></div>}<RecordEditorActions label="Сохранить" disabled={busy || source.loading || Boolean(source.error) || stale || !dirty} busy={busy} onCancel={close} /></form></RecordEditor> : <><Card className={styles.toolbar}><h1>Шаблоны расписания</h1><SearchField label="Поиск шаблона или исходной группы" value={query} placeholder="" onChange={value => change("q", value.slice(0, 256))} /><Dropdown label="Состояние" value={status} options={[{ value: "active", label: "Действующие" }, { value: "archived", label: "В архиве" }, { value: "all", label: "Все" }]} onChange={value => change("status", value)} /><p className={styles.note}>Новый шаблон сохраняется из выбранной версии в архиве публикаций. Применение доступно через копирование в действиях нужной группы и недели.</p></Card>
      {source.loading && <p role="status">Загружаем шаблоны…</p>}
      {source.snapshot && !source.loading && !queryError && !rows.length && <Card className={styles.card}>Шаблоны не найдены.</Card>}
      {rows.slice((currentPage - 1) * 20, currentPage * 20).map(row => <Card className={styles.card} key={row.id}><h2>{row.name}{row.status === "archived" ? " · архив" : ""}</h2>{row.source ? <p>{getAcademicGroup(row.source.groupId)?.name ?? "Группа недоступна"} · неделя с {formatAcademicDay(row.source.weekStart)} · версия {row.source.number} · занятий: {row.source.lessons}</p> : <p role="status">Исходная публикация недоступна. Применение заблокировано; запись шаблона сохранена.</p>}<div className={styles.actions}><button type="button" disabled={busy || source.loading} onClick={() => { setError(""); setEditor({ record: row, context: source.snapshot!.context, name: row.name }); }}>Переименовать</button><button type="button" disabled={busy || source.loading} onClick={() => void run(row.status === "active" ? "archive" : "restore", row)}>{row.status === "active" ? "В архив" : "Восстановить"}</button></div>{source.snapshot && <TemplateHistory key={`${row.id}:${row.revision}`} context={source.snapshot.context} id={row.id} />}</Card>)}
      {pages > 1 && <nav className={styles.actions} aria-label="Страницы шаблонов"><button type="button" disabled={currentPage <= 1 || busy} onClick={() => change("page", String(currentPage - 1))}>Назад</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages || busy} onClick={() => change("page", String(currentPage + 1))}>Далее</button></nav>}
    </>}
    {source.error && <div className={styles.actions}><button type="button" onClick={source.refresh}>Повторить чтение</button></div>}
  </div>;
}
export default function ScheduleTemplatesPage() { const { currentUser } = useRole(); return <TemplatesWorkspace key={currentUser.id} actorId={currentUser.id} />; }
