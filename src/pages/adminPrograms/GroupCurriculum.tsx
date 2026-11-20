import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card";
import Dropdown from "../../components/Dropdown";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import useCurricula from "../../hooks/useCurricula";
import { curriculaService } from "../../data/curriculaStore";
import { sameCurriculumData } from "../../domain/curricula";
import type { CurriculumContext } from "../../domain/curriculumTypes";
import { CurriculumReadOnlyRows, CurriculumRowsSummary } from "./CurriculumRows";
import CurriculumHistory from "./CurriculumHistory";
import styles from "./index.module.scss";
import GroupCalendarLink from "./GroupCalendarLink";

interface Editor { context: CurriculumContext; groupRevision: number; bindingRevision: number; planId: string; periods: Array<{ semester: number; termId: string }>; baseline: string }
export default function GroupCurriculum({ actorId, groupId }: { actorId: string; groupId: string }) {
  const source = useCurricula(actorId), snapshot = source.snapshot;
  const binding = snapshot?.bindings.find(row => row.group.id === groupId), group = snapshot?.groups.find(row => row.id === groupId);
  const [editor, setEditor] = useState<Editor | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const pending = useRef(false), { requestAction } = useUnsavedChangesGuard();
  const dirty = Boolean(editor && JSON.stringify([editor.planId, editor.periods]) !== editor.baseline);
  useUnsavedChangesWarning(dirty || busy);
  const stale = Boolean(editor && snapshot && !sameCurriculumData(editor.context, snapshot.context));
  const disabled = busy || source.loading || Boolean(source.error) || !snapshot || stale;
  const plan = snapshot?.plans.find(row => row.id === (editor?.planId ?? binding?.planId));
  const referenceUpdates = Boolean(editor && binding && snapshot && (group?.revision !== binding.group.revision || group?.name !== binding.group.name || binding.periods.some(entry => {
    const term = snapshot.terms.find(row => row.id === entry.period.term.id), year = snapshot.years.find(row => row.id === term?.yearId);
    return !sameCurriculumData(term, entry.period.term) || !sameCurriculumData(year, entry.period.year);
  })));
  const semesters = [...new Set(plan?.entries.map(entry => entry.semester) ?? [])].sort((a, b) => a - b);
  const open = () => {
    if (!snapshot || !group || group.status === "archived" || source.loading || source.error) return;
    const planId = binding?.planId ?? "", periods = binding?.periods.map(entry => ({ semester: entry.semester, termId: entry.period.term.id })) ?? [];
    setError(""); setMessage(""); setEditor({ context: snapshot.context, groupRevision: group.revision, bindingRevision: binding?.revision ?? 0, planId, periods, baseline: JSON.stringify([planId, periods]) });
  };
  const close = () => { if (!busy) requestAction(() => { setEditor(null); setError(""); }); };
  const review = async () => {
    if (!editor || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const latest = await curriculaService.read(actorId), latestGroup = latest.groups.find(row => row.id === groupId), latestBinding = latest.bindings.find(row => row.group.id === groupId);
      if (!latestGroup || latestGroup.status === "archived" || latestGroup.revision !== editor.groupRevision || (latestBinding?.revision ?? 0) !== editor.bindingRevision) throw new Error("Группа или её назначение изменились. Ввод сохранён; откройте актуальное назначение заново.");
      setEditor({ ...editor, context: latest.context }); source.refresh();
    } catch (failure) { console.error("Не удалось перепроверить назначение учебного плана:", failure); setError(failure instanceof Error ? failure.message : "Проверка недоступна. Ввод сохранён."); }
    finally { pending.current = false; setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!editor || disabled || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await curriculaService.execute({ ...editor.context, type: "bind", groupId, groupRevision: editor.groupRevision, bindingRevision: editor.bindingRevision, planId: editor.planId, periods: editor.periods });
      setEditor(null); setMessage("Версия плана и календарные семестры назначены группе.");
    } catch (failure) { console.error("Не удалось назначить учебный план группе:", failure); setError(failure instanceof Error ? failure.message : "Назначение недоступно. Ввод сохранён."); }
    finally { pending.current = false; setBusy(false); }
  };
  const termOptions = [{ value: "", label: "Пока не назначен" }, ...(snapshot?.terms ?? []).map(term => ({ value: term.id, label: `${snapshot?.years.find(year => year.id === term.yearId)?.name ?? ""} · ${term.name} (${term.startsOn} — ${term.endsOn})` }))];
  return <Card className={styles.card}><div className={styles.actions}><h2>Учебный план группы</h2><Link to="/admin/curricula">Все планы</Link><GroupCalendarLink groupId={groupId} />{!editor && <button type="button" disabled={!snapshot || source.loading || Boolean(source.error) || !group || group.status === "archived"} onClick={open}>{binding ? "Изменить назначение" : "Назначить план"}</button>}</div>
    {source.loading && <p role="status">Загрузка учебного плана…</p>}
    {source.error && <p role="alert" className={styles.error}>{source.error} <button type="button" onClick={source.refresh}>Повторить</button></p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status">{message}</p>}
    {stale && <p role="alert" className={styles.error}>Назначение, справочники или права изменились. Ввод сохранён. <button type="button" disabled={busy} onClick={() => void review()}>Обновить проверку</button></p>}
    {editor ? <form className={styles.form} onSubmit={event => void save(event)}><Dropdown label="Опубликованная версия плана" value={editor.planId} options={(snapshot?.plans ?? []).filter(row => row.state === "published").map(row => ({ value: row.id, label: `${row.name} · версия ${row.number} · ${row.program.name} · ${row.form.name}` }))} disabled={disabled} searchable onChange={planId => {
      const nextPlan = snapshot?.plans.find(row => row.id === planId), valid = new Set(nextPlan?.entries.map(row => row.semester));
      setEditor({ ...editor, planId, periods: editor.periods.filter(row => valid.has(row.semester)) });
    }} />
      <div className={styles.calendar}>{semesters.map(semester => <Dropdown key={semester} label={`${semester} семестр плана — календарный период группы`} value={editor.periods.find(row => row.semester === semester)?.termId ?? ""} options={termOptions} disabled={disabled} searchable onChange={termId => setEditor({ ...editor, periods: [...editor.periods.filter(row => row.semester !== semester), ...(termId ? [{ semester, termId }] : [])].sort((a, b) => a.semester - b.semester) })} />)}</div>
      <p className={styles.note}>Календарные периоды можно добавлять по мере подготовки учебных лет. Существующие ведомости и расписание сохраняются.</p>
      <div className={styles.actions}><button type="button" disabled={busy} onClick={close}>Отмена</button><button className={styles.primary} type="submit" disabled={disabled || !plan || !dirty && !referenceUpdates}>{busy ? "Сохраняем…" : "Сохранить назначение"}</button></div>
    </form> : binding && plan ? <><p>{plan.name} · версия {plan.number}</p><p>{plan.program.name} · {plan.form.name}</p><CurriculumRowsSummary entries={plan.entries} hoursPerCredit={plan.hoursPerCredit} />
      <div>{[...new Set(plan.entries.map(row => row.semester))].sort((a, b) => a - b).map(semester => { const period = binding.periods.find(row => row.semester === semester)?.period; return <p key={semester}>{semester} семестр: {period ? `${period.year.name} · ${period.term.name} (${period.term.startsOn} — ${period.term.endsOn})` : "календарный период пока не назначен"}</p>; })}</div>
      <details><summary>Дисциплины и часы</summary><CurriculumReadOnlyRows entries={plan.entries} /></details>
    </> : snapshot && !source.loading && <p className={styles.note}>Учебный план пока не назначен.</p>}
    {binding && snapshot && <CurriculumHistory context={snapshot.context} entity="binding" id={groupId} />}
  </Card>;
}
