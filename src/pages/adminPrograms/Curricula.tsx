import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card";
import Dropdown from "../../components/Dropdown";
import SearchField from "../../components/SearchField";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import useCurricula from "../../hooks/useCurricula";
import { curriculaService } from "../../data/curriculaStore";
import { sameCurriculumData } from "../../domain/curricula";
import type { CurriculumContext, CurriculumDraft, CurriculumPlan } from "../../domain/curriculumTypes";
import { matchesSearchText } from "../../domain/search";
import CurriculumRows, { CurriculumReadOnlyRows, CurriculumRowsSummary } from "./CurriculumRows";
import CurriculumHistory from "./CurriculumHistory";
import styles from "./index.module.scss";

const draftFrom = (plan?: CurriculumPlan): CurriculumDraft => plan ? { name: plan.name, programId: plan.program.id, formId: plan.form.id, academicHourMinutes: plan.academicHourMinutes, hoursPerCredit: plan.hoursPerCredit, entries: structuredClone(plan.entries) } : { name: "", programId: "", formId: "", academicHourMinutes: 45, hoursPerCredit: 36, entries: [] };
interface Editor { plan?: CurriculumPlan; draft: CurriculumDraft; context: CurriculumContext }
function CurriculaWorkspace({ actorId }: { actorId: string }) {
  const source = useCurricula(actorId), snapshot = source.snapshot;
  const [editor, setEditor] = useState<Editor | null>(null), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const pending = useRef(false), generation = useRef(0), { requestAction } = useUnsavedChangesGuard();
  const dirty = Boolean(editor && !sameCurriculumData(editor.draft, draftFrom(editor.plan)));
  useUnsavedChangesWarning(dirty || busy);
  const stale = Boolean(editor && snapshot && !sameCurriculumData(editor.context, snapshot.context));
  const blocked = busy || source.loading || Boolean(source.error) || !snapshot || stale;
  const readOnly = editor?.plan?.state === "published";
  const referenceUpdates = Boolean(editor?.plan && !readOnly && snapshot && (
    !sameCurriculumData(editor.plan.program, snapshot.programs.find(row => row.id === editor.draft.programId))
    || !sameCurriculumData(editor.plan.form, snapshot.forms.find(row => row.id === editor.draft.formId))
  ));
  const rows = (snapshot?.plans ?? []).filter(plan => matchesSearchText(`${plan.name} ${plan.program.name} ${plan.program.code} ${plan.form.name}`, query)).sort((a, b) => a.name.localeCompare(b.name, "ru") || b.number - a.number);
  const pages = Math.max(1, Math.ceil(rows.length / 20)), current = Math.min(page, pages);
  const open = (plan?: CurriculumPlan) => {
    if (!snapshot || source.loading || source.error) return;
    generation.current++; setError(""); setMessage(""); setEditor({ plan, draft: draftFrom(plan), context: snapshot.context });
  };
  const close = () => { if (!busy) requestAction(() => { generation.current++; setEditor(null); setError(""); }); };
  const review = async () => {
    if (!editor || pending.current) return;
    const request = ++generation.current;
    pending.current = true; setBusy(true); setError("");
    try {
      const latest = await curriculaService.read(actorId);
      if (generation.current !== request) return;
      const target = editor.plan && latest.plans.find(plan => plan.id === editor.plan!.id);
      if (editor.plan && target?.revision !== editor.plan.revision) throw new Error("Сама версия плана изменилась. Ввод сохранён; откройте актуальную карточку заново.");
      setEditor({ ...editor, context: latest.context }); source.refresh();
    } catch (failure) { console.error("Не удалось перепроверить учебный план:", failure); setError(failure instanceof Error ? failure.message : "Перепроверка недоступна. Ввод сохранён."); }
    finally { pending.current = false; setBusy(false); }
  };
  const perform = async (type: "save" | "publish" | "new-version", event?: FormEvent) => {
    event?.preventDefault();
    if (!editor || blocked || pending.current || type !== "save" && (!editor.plan || dirty)) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const target = editor.plan ? { planId: editor.plan.id, planRevision: editor.plan.revision } : {};
      await curriculaService.execute(type === "save" ? { ...editor.context, ...target, type, draft: editor.draft } : { ...editor.context, type, planId: editor.plan!.id, planRevision: editor.plan!.revision });
      setEditor(null); setMessage(type === "publish" ? "Версия опубликована. Теперь её можно назначить группе." : type === "new-version" ? "Создан черновик следующей версии. Назначения групп сохранены." : "Черновик учебного плана сохранён.");
    } catch (failure) { console.error("Не удалось выполнить действие с учебным планом:", failure); setError(failure instanceof Error ? failure.message : "Изменение недоступно. Ввод сохранён."); }
    finally { pending.current = false; setBusy(false); }
  };
  const update = (patch: Partial<CurriculumDraft>) => { if (editor && !readOnly && !blocked) setEditor({ ...editor, draft: { ...editor.draft, ...patch } }); };
  return <div className={`pageContainer ${styles.page}`}>
    <nav className={styles.actions} aria-label="Учебные справочники"><Link to="/admin/programs">Программы и формы</Link><Link to="/admin/periods">Учебные периоды</Link><Link to="/admin/groups">Группы</Link></nav>
    {source.error && <p className={styles.error} role="alert">{source.error} <button type="button" onClick={source.refresh}>Повторить чтение</button></p>}
    {message && <p role="status">{message}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {editor ? <RecordEditor title={editor.plan ? `${editor.plan.name} · версия ${editor.plan.number}` : "Новый учебный план"} context={readOnly ? "Опубликованная версия" : "Черновик учебного плана"} dirty={dirty} busy={busy} onClose={close}>
      {stale && <p className={styles.error} role="alert">План, справочники или права изменились. Ввод сохранён. <button type="button" disabled={busy} onClick={() => void review()}>Обновить проверку</button></p>}
      {readOnly && editor.plan ? <><p>{editor.plan.program.name} · {editor.plan.form.name}</p><p>{editor.plan.academicHourMinutes} мин./ак. ч. · {editor.plan.hoursPerCredit} ак. ч./з.е.</p><CurriculumRowsSummary entries={editor.plan.entries} hoursPerCredit={editor.plan.hoursPerCredit} /><CurriculumReadOnlyRows entries={editor.plan.entries} /><div className={styles.actions}><button type="button" disabled={blocked || snapshot?.plans.some(plan => plan.familyId === editor.plan!.familyId && plan.number > editor.plan!.number)} onClick={() => void perform("new-version")}>Создать следующую версию</button><Link to="/admin/groups">Назначить группе</Link></div></> : <form className={styles.form} onSubmit={event => void perform("save", event)}>
        <fieldset className={styles.fields} disabled={blocked}><legend>Реквизиты плана</legend><label className={styles.field}>Название<input required minLength={2} maxLength={160} value={editor.draft.name} onChange={event => update({ name: event.target.value })} /></label>
          <Dropdown label="Программа" value={editor.draft.programId} options={(snapshot?.programs ?? []).map(row => ({ value: row.id, label: `${row.code ? `${row.code} · ` : ""}${row.name}` }))} disabled={blocked} searchable onChange={programId => update({ programId })} />
          <Dropdown label="Форма обучения" value={editor.draft.formId} options={(snapshot?.forms ?? []).map(row => ({ value: row.id, label: row.name }))} disabled={blocked} onChange={formId => update({ formId })} />
          <div className={styles.hourGrid}><Dropdown label="Продолжительность академического часа" value={String(editor.draft.academicHourMinutes)} options={[{ value: "40", label: "40 минут" }, { value: "45", label: "45 минут" }]} disabled={blocked} onChange={value => update({ academicHourMinutes: Number(value) as 40 | 45 })} />
            <label className={styles.field}>Академических часов в зачётной единице<input type="number" required min={1} max={100} step={0.01} value={editor.draft.hoursPerCredit || ""} onChange={event => update({ hoursPerCredit: Number(event.target.value) })} /></label></div>
        </fieldset>
        <CurriculumRows entries={editor.draft.entries} subjects={snapshot?.subjects ?? []} disabled={blocked} onChange={entries => update({ entries })} /><CurriculumRowsSummary entries={editor.draft.entries} hoursPerCredit={editor.draft.hoursPerCredit} />
        <RecordEditorActions label="Сохранить черновик" disabled={blocked || !editor.draft.programId || !editor.draft.formId || editor.draft.name.trim().length < 2 || Boolean(editor.plan && !dirty && !referenceUpdates)} busy={busy} onCancel={close} />
        {editor.plan && <div className={styles.actions}><button type="button" disabled={blocked || dirty || referenceUpdates || !editor.plan.entries.length} onClick={() => void perform("publish")}>Опубликовать версию</button>{(dirty || referenceUpdates) && <span className={styles.note}>Перед публикацией сохраните актуальный черновик.</span>}</div>}
      </form>}
      {editor.plan && snapshot && <CurriculumHistory context={snapshot.context} entity="plan" id={editor.plan.id} />}
    </RecordEditor> : <><Card className={styles.toolbar}><SearchField label="Поиск учебного плана" value={query} onChange={value => { setQuery(value.slice(0, 256)); setPage(1); }} placeholder="" /><div className={styles.actions}><span className={styles.note}>Версий: {rows.length}</span><button className={styles.primary} type="button" disabled={!snapshot || source.loading || Boolean(source.error)} onClick={() => open()}>Создать учебный план</button></div></Card>
      {source.loading && <p role="status">Загрузка планов…</p>}
      <div className={styles.list}>{rows.slice((current - 1) * 20, current * 20).map(plan => <Card className={styles.card} key={plan.id}><h2>{plan.name} · версия {plan.number}</h2><p>{plan.program.name} · {plan.form.name} · {plan.state === "published" ? "Опубликована" : "Черновик"}</p><CurriculumRowsSummary entries={plan.entries} hoursPerCredit={plan.hoursPerCredit} /><button type="button" disabled={source.loading || Boolean(source.error)} onClick={() => open(plan)}>Открыть</button></Card>)}</div>
      {snapshot && !rows.length && !source.loading && <Card>Учебные планы не найдены.</Card>}
      {pages > 1 && <nav className={styles.actions} aria-label="Страницы учебных планов"><button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>Назад</button><span>{current} / {pages}</span><button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>Далее</button></nav>}
    </>}
  </div>;
}
export default function AdminCurricula() { const { currentUser } = useRole(); return <CurriculaWorkspace key={currentUser.id} actorId={currentUser.id} />; }
