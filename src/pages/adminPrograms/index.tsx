import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card";
import Tabs from "../../components/Tabs";
import SearchField from "../../components/SearchField";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { educationDirectoriesService, type EducationDirectoriesSnapshot } from "../../data/educationDirectoriesStore";
import type { EducationDirectoryContext, EducationProgram, StudyForm } from "../../domain/educationDirectories";
import { matchesSearchText } from "../../domain/search";
import DirectoryHistory from "./DirectoryHistory";
import styles from "./index.module.scss";

type Entity = "program" | "form";
interface Editor { entity: Entity; record?: EducationProgram | StudyForm; name: string; code: string; context: EducationDirectoryContext }
function ProgramsWorkspace({ actorId }: { actorId: string }) {
  const [entity, setEntity] = useState<Entity>("program"), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [source, setSource] = useState<{ snapshot?: EducationDirectoriesSnapshot; loading: boolean; error: string }>({ loading: true, error: "" });
  const [editor, setEditor] = useState<Editor | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const generation = useRef(0), pending = useRef(false), fieldId = useId();
  const { requestAction } = useUnsavedChangesGuard();
  const invalidate = useCallback(() => { generation.current++; }, []);
  const refresh = useCallback(() => {
    const request = ++generation.current;
    setSource(previous => ({ ...previous, loading: true }));
    void educationDirectoriesService.read(actorId).then(snapshot => {
      if (generation.current === request) setSource({ snapshot, loading: false, error: "" });
    }).catch(failure => {
      console.error("Не удалось обновить программы и формы обучения:", failure);
      if (generation.current === request) setSource({ loading: false, error: failure instanceof Error ? failure.message : "Справочники недоступны." });
    });
  }, [actorId]);
  useEffect(() => { refresh(); const stop = educationDirectoriesService.subscribe(refresh); return () => { invalidate(); stop(); }; }, [refresh, invalidate]);
  const snapshot = source.snapshot;
  const rows = useMemo(() => (entity === "program" ? snapshot?.programs ?? [] : snapshot?.forms ?? []).filter(row => matchesSearchText(`${row.name} ${"code" in row ? row.code : ""}`, query)).sort((a, b) => a.name.localeCompare(b.name, "ru")), [snapshot, entity, query]);
  const pages = Math.max(1, Math.ceil(rows.length / 20)), currentPage = Math.min(page, pages);
  const dirty = Boolean(editor && (editor.name !== (editor.record?.name ?? "") || editor.code !== (editor.record && "code" in editor.record ? editor.record.code : "")));
  useUnsavedChangesWarning(dirty || busy);
  const stale = Boolean(editor && snapshot && (snapshot.revision !== editor.context.expectedRevision || snapshot.actorRevision !== editor.context.actorRevision));
  const locked = busy || source.loading || Boolean(source.error) || stale;
  const context = useMemo(() => snapshot ? { actorId, actorRevision: snapshot.actorRevision, expectedRevision: snapshot.revision } : undefined, [actorId, snapshot]);
  const open = (record?: EducationProgram | StudyForm) => {
    if (!context || source.loading) return;
    setError(""); setMessage(""); setEditor({ entity, record, name: record?.name ?? "", code: record && "code" in record ? record.code : "", context });
  };
  const close = () => { if (!busy) requestAction(() => { setEditor(null); setError(""); }); };
  const review = async () => {
    if (!editor || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    const request = ++generation.current;
    try {
      const latest = await educationDirectoriesService.read(actorId);
      if (generation.current !== request) return;
      const target = editor.record && (editor.entity === "program" ? latest.programs : latest.forms).find(row => row.id === editor.record!.id);
      if (editor.record && (!target || target.revision !== editor.record.revision)) throw new Error("Сама запись изменилась. Ввод сохранён; откройте актуальную карточку заново перед изменением.");
      setSource({ snapshot: latest, loading: false, error: "" });
      setEditor({ ...editor, context: { actorId, actorRevision: latest.actorRevision, expectedRevision: latest.revision } });
    } catch (failure) { console.error("Не удалось перепроверить учебный справочник:", failure); setError(failure instanceof Error ? failure.message : "Не удалось обновить проверку. Ввод сохранён."); }
    finally { pending.current = false; setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!editor || locked || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const base = { ...editor.context, ...(editor.record ? { entityId: editor.record.id, entityRevision: editor.record.revision } : {}) };
      await educationDirectoriesService.execute(editor.entity === "program" ? { ...base, entity: "program", draft: { name: editor.name, code: editor.code } } : { ...base, entity: "form", draft: { name: editor.name } });
      setEditor(null); setMessage(editor.entity === "program" ? "Программа сохранена." : "Форма обучения сохранена.");
    } catch (failure) { console.error("Не удалось сохранить учебный справочник:", failure); setError(failure instanceof Error ? failure.message : "Сохранение недоступно. Ввод сохранён."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <div className={`pageContainer ${styles.page}`}>
    <nav className={styles.actions} aria-label="Учебные справочники"><Link to="/admin/curricula">Учебные планы</Link><Link to="/admin/calendars">Учебные календари</Link><Link to="/admin/groups">Группы</Link><Link to="/admin/periods">Учебные периоды</Link></nav>
    {source.error && <p className={styles.error} role="alert">{source.error} <button type="button" onClick={refresh}>Повторить чтение</button></p>}
    {message && <p role="status">{message}</p>}
    {editor ? <RecordEditor title={editor.record ? editor.record.name : editor.entity === "program" ? "Новая программа" : "Новая форма обучения"} context="Учебные справочники" dirty={dirty} busy={busy} onClose={close}>
      {stale && <p className={styles.error} role="alert">Справочник или права изменились. Ввод сохранён. <button type="button" disabled={busy} onClick={() => void review()}>Обновить проверку</button></p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <form className={styles.form} onSubmit={event => void save(event)}><fieldset className={styles.fields} disabled={locked}><legend>Реквизиты</legend>
        <label className={styles.field} htmlFor={`${fieldId}-name`}>Название<input id={`${fieldId}-name`} required minLength={2} maxLength={160} value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} /></label>
        {editor.entity === "program" && <label className={styles.field} htmlFor={`${fieldId}-code`}>Код программы (необязательно)<input id={`${fieldId}-code`} maxLength={64} value={editor.code} onChange={event => setEditor({ ...editor, code: event.target.value })} /></label>}
      </fieldset><RecordEditorActions label="Сохранить" disabled={locked || editor.name.trim().length < 2 || Boolean(editor.record && !dirty)} busy={busy} onCancel={close} /></form>
      {editor.record && context && <DirectoryHistory context={context} entity={editor.entity} entityId={editor.record.id} />}
    </RecordEditor> : <>
      <Card className={styles.toolbar}><Tabs ariaLabel="Вид учебного справочника" items={[{ value: "program", label: "Программы" }, { value: "form", label: "Формы обучения" }]} value={entity} onChange={value => { setEntity(value as Entity); setPage(1); setQuery(""); }} /><SearchField label="Поиск по названию и коду" value={query} onChange={value => { setQuery(value.slice(0, 256)); setPage(1); }} placeholder="" /><div className={styles.actions}><span className={styles.note}>Записей: {rows.length}</span><button className={styles.primary} type="button" disabled={!snapshot || source.loading || Boolean(source.error)} onClick={() => open()}>{entity === "program" ? "Добавить программу" : "Добавить форму обучения"}</button></div></Card>
      {source.loading && <p role="status">Загрузка справочников…</p>}
      <div className={styles.list}>{rows.slice((currentPage - 1) * 20, currentPage * 20).map(row => <Card className={styles.card} key={row.id}><h2>{row.name}</h2>{"code" in row && typeof row.code === "string" && row.code && <p>{row.code}</p>}<button type="button" disabled={source.loading} onClick={() => open(row)}>Реквизиты и история</button></Card>)}</div>
      {snapshot && !rows.length && !source.loading && <Card>Записи не найдены.</Card>}
      {pages > 1 && <nav className={styles.actions} aria-label="Страницы справочника"><button type="button" disabled={currentPage <= 1 || source.loading} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages || source.loading} onClick={() => setPage(currentPage + 1)}>Далее</button></nav>}
    </>}
  </div>;
}
export default function AdminPrograms() { const { currentUser } = useRole(); return <ProgramsWorkspace key={currentUser.id} actorId={currentUser.id} />; }
