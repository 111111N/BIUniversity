import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import Card from "../../components/Card";
import Dropdown from "../../components/Dropdown";
import SearchField from "../../components/SearchField";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { academicPeriodsService, type AcademicPeriodsSnapshot } from "../../data/academicPeriodsStore";
import { isAcademicCalendarDate, type AcademicPeriodCommand, type AcademicYear } from "../../domain/academicPeriods";
import { matchesSearchText } from "../../domain/search";
import PeriodHistory from "./PeriodHistory";
import { refreshPeriodEditor, type PeriodEditor } from "./editorModel";
import styles from "../assessments/index.module.scss";
import fields from "../adminGroups/GroupDetailsForm.module.scss";

function PeriodsWorkspace({ actorId }: { actorId: string }) {
  const { requestAction } = useUnsavedChangesGuard();
  const [state, setState] = useState<{ snapshot?: AcademicPeriodsSnapshot; error: string; loading: boolean }>({ error: "", loading: true });
  const [yearId, setYearId] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [editor, setEditor] = useState<PeriodEditor | null>(null), [history, setHistory] = useState<{ entity: "year" | "term"; id: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const readGeneration = useRef(0), writeGeneration = useRef(0), pending = useRef(false), fieldId = useId();
  const refresh = useCallback(() => {
    const generation = ++readGeneration.current;
    setState(previous => ({ ...previous, loading: true }));
    academicPeriodsService.read(actorId).then(snapshot => {
      if (readGeneration.current === generation) setState({ snapshot, error: "", loading: false });
    }).catch(failure => {
      console.error("Не удалось загрузить справочник учебных периодов:", failure);
      if (readGeneration.current === generation) setState({ error: failure instanceof Error ? failure.message : "Не удалось прочитать учебные периоды.", loading: false });
    });
  }, [actorId]);
  const invalidate = useCallback(() => { readGeneration.current++; writeGeneration.current++; }, []);
  useEffect(() => {
    refresh(); const stop = academicPeriodsService.subscribe(refresh);
    return () => { stop(); invalidate(); };
  }, [refresh, invalidate]);
  const snapshot = state.snapshot;
  const years = [...(snapshot?.years ?? [])].sort((a, b) => b.startsOn.localeCompare(a.startsOn) || a.name.localeCompare(b.name));
  const selected = years.find(row => row.id === (yearId || years[0]?.id));
  const terms = (snapshot?.terms ?? []).filter(row => row.yearId === selected?.id && matchesSearchText(`${row.name} ${row.startsOn} ${row.endsOn}`, query)).sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(terms.length / 20)), currentPage = Math.min(page, pages);
  const dirty = Boolean(editor && JSON.stringify(editor.draft) !== JSON.stringify(editor.initial));
  useUnsavedChangesWarning(dirty || busy);
  const stale = Boolean(editor && snapshot && (editor.base.revision !== snapshot.revision || editor.base.actorRevision !== snapshot.actorRevision));
  const blocked = busy || state.loading || Boolean(state.error) || !snapshot;
  const close = () => { if (!pending.current) requestAction(() => { setEditor(null); setError(""); }); };
  const open = (entity: "year" | "term", record?: AcademicYear) => {
    if (blocked || !snapshot || (entity === "term" && !selected)) return;
    requestAction(() => {
      const draft = record ? { name: record.name, startsOn: record.startsOn, endsOn: record.endsOn } : { name: "", startsOn: entity === "term" ? selected!.startsOn : "", endsOn: entity === "term" ? selected!.endsOn : "" };
      setEditor({ entity, id: record?.id, yearId: entity === "term" ? selected!.id : undefined, base: snapshot, source: record, initial: draft, draft });
      setHistory(null); setError(""); setMessage("");
    });
  };
  const recheck = () => {
    if (!editor || !snapshot || blocked) return;
    try { setEditor(refreshPeriodEditor(editor, snapshot)); setError(""); }
    catch (failure) { console.error("Не удалось перепроверить учебный период:", failure); setError(failure instanceof Error ? failure.message : "Не удалось перепроверить. Ввод сохранён."); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!editor || blocked || stale || pending.current || (editor.id && !dirty)) return;
    if (!isAcademicCalendarDate(editor.draft.startsOn) || !isAcademicCalendarDate(editor.draft.endsOn) || editor.draft.startsOn > editor.draft.endsOn) { setError("Проверьте даты начала и окончания периода."); return; }
    const context = { actorId, actorRevision: editor.base.actorRevision, expectedRevision: editor.base.revision, draft: editor.draft };
    const command: AcademicPeriodCommand = editor.entity === "year" ? editor.id ? { ...context, type: "update-year", yearId: editor.id, entityRevision: editor.source!.revision } : { ...context, type: "create-year" }
      : editor.id ? { ...context, type: "update-term", termId: editor.id, entityRevision: editor.source!.revision } : { ...context, type: "create-term", yearId: editor.yearId! };
    const generation = ++writeGeneration.current; pending.current = true; setBusy(true); setError("");
    try {
      await academicPeriodsService.execute(command);
      if (writeGeneration.current === generation) { setEditor(null); setMessage(editor.id ? "Изменения сохранены в истории." : "Учебный период создан."); refresh(); }
    } catch (failure) {
      console.error("Не удалось сохранить реквизиты учебного периода:", failure);
      if (writeGeneration.current === generation) { setError(failure instanceof Error ? failure.message : "Не удалось сохранить. Ввод остался в форме."); refresh(); }
    } finally { if (writeGeneration.current === generation) { pending.current = false; setBusy(false); } }
  };
  return <div className={styles.page}>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>Общий справочник вуза</p><h1>Учебные периоды</h1><p className={styles.note}>Учебные годы и семестры с датами, которые задаёт настройщик. Номер семестра в зачётке хранится отдельно.</p></div><div className={styles.actions}><button className={styles.primary} type="button" disabled={blocked} onClick={() => open("year")}>Добавить учебный год</button></div></header>
    {state.error && <div className={styles.error} role="alert"><p>{state.error}</p><button type="button" disabled={busy || state.loading} onClick={refresh}>Повторить чтение</button></div>}
    {state.loading && <p className={styles.note} role="status">Обновляем учебные периоды…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.note} role="status">{message}</p>}
    {editor ? <RecordEditor title={editor.id ? "Изменить учебный период" : editor.entity === "year" ? "Новый учебный год" : "Новый семестр"} context={editor.entity === "term" ? editor.base.years.find(row => row.id === editor.yearId)?.name : undefined} dirty={dirty} busy={busy} onClose={close}>
      {stale && <div className={styles.error} role="alert"><p>Справочник или права изменились. Ввод сохранён; перепроверьте данные перед сохранением.</p><button type="button" disabled={blocked} onClick={recheck}>Обновить проверку</button></div>}
      <form className={styles.form} onSubmit={event => void submit(event)} aria-label="Реквизиты учебного периода">
        <fieldset className={fields.fields} disabled={blocked}>
          <legend className={fields.legend}>Название и даты</legend>
          <div className={fields.name}><label htmlFor={`${fieldId}-name`}>Название</label><input id={`${fieldId}-name`} required minLength={2} maxLength={160} autoComplete="off" value={editor.draft.name} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, name: event.target.value } })} /></div>
          {(["startsOn", "endsOn"] as const).map(field => <div key={field} className={fields.field}><label htmlFor={`${fieldId}-${field}`}>{field === "startsOn" ? "Начало" : "Окончание включительно"}</label><input id={`${fieldId}-${field}`} required type="date" min="0001-01-01" max="9999-12-31" value={editor.draft[field]} onChange={event => setEditor({ ...editor, draft: { ...editor.draft, [field]: event.target.value } })} /></div>)}
        </fieldset>
        <RecordEditorActions label={editor.id ? "Сохранить изменения" : "Создать период"} disabled={blocked || stale || Boolean(editor.id && !dirty)} busy={busy} onCancel={close} hint="Семестр должен полностью входить в учебный год. Предыдущие реквизиты сохраняются в истории." />
      </form>
    </RecordEditor> : snapshot && !state.error && <>
      {!years.length ? <Card><p className={styles.note}>Учебных годов пока нет. Добавьте год с явными датами, затем создайте его семестры.</p></Card> : <>
        <Dropdown label="Учебный год" value={selected?.id ?? ""} placeholder="Выберите год" options={years.map(row => ({ value: row.id, label: `${row.name} · ${row.startsOn} — ${row.endsOn}` }))} disabled={blocked} onChange={value => { setYearId(value); setPage(1); setQuery(""); setHistory(null); }} />
        {selected ? <><Card className={styles.card}><div className={styles.cardHeader}><div><h2>{selected.name}</h2><p>{selected.startsOn} — {selected.endsOn} включительно</p></div><div className={styles.actions}><button type="button" disabled={blocked} onClick={() => open("year", selected)}>Изменить год</button><button type="button" disabled={blocked} onClick={() => setHistory({ entity: "year", id: selected.id })}>История года</button><button type="button" disabled={blocked} className={styles.primary} onClick={() => open("term")}>Добавить семестр</button></div></div></Card>
          <SearchField label="Поиск семестров" value={query} onChange={value => { setQuery(value); setPage(1); }} />
          <p className={styles.note} role="status">Семестров: {terms.length}</p>
          {!terms.length && <p className={styles.note}>{query ? "По запросу ничего не найдено." : "В этом учебном году ещё нет семестров."}</p>}
          {terms.slice((currentPage - 1) * 20, currentPage * 20).map(term => <Card key={term.id} as="article" className={styles.catalogCard}><div><h2>{term.name}</h2><p className={styles.note}>{term.startsOn} — {term.endsOn} включительно</p></div><div className={styles.actions}><button type="button" disabled={blocked} onClick={() => open("term", term)}>Изменить семестр</button><button type="button" disabled={blocked} onClick={() => setHistory({ entity: "term", id: term.id })}>История семестра</button></div></Card>)}
          {pages > 1 && <nav className={styles.pagination} aria-label="Страницы семестров"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Далее</button></nav>}
        </> : <p className={styles.error} role="alert">Выбранный учебный год недоступен. Выберите актуальный год.</p>}
      </>}
      {history && !state.loading && <Card><PeriodHistory key={`${history.entity}:${history.id}:${snapshot.revision}`} request={{ actorId, actorRevision: snapshot.actorRevision, expectedRevision: snapshot.revision, entity: history.entity, entityId: history.id }} onClose={() => setHistory(null)} /></Card>}
    </>}
  </div>;
}
export default function AdminPeriodsPage() {
  const { currentUser } = useRole();
  return <PeriodsWorkspace key={currentUser.id} actorId={currentUser.id} />;
}
