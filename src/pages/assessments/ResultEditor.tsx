import { useId, useState, type FormEvent } from "react";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import SearchField from "../../components/SearchField";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { assessmentService } from "../../data/assessmentStore";
import { canRecordAssessmentResults } from "../../domain/assessments";
import { ATTEMPT_KIND_LABELS, assessmentOutcomeLabel, type Assessment, type AssessmentAttempt, type AssessmentSnapshot } from "../../domain/assessmentTypes";
import { matchesSearchText } from "../../domain/search";
import { Pagination } from "./SelectionList";
import { assessmentContext, assessmentContextChanged, displayDate, outcomeValue, paginate, parseOutcome } from "./model";
import useAssessmentClock from "./useAssessmentClock";
import { reconcileAssessmentResults } from "./resultReconciliation";
import styles from "./index.module.scss";

interface Props { actorId: string; snapshot: AssessmentSnapshot; assessment: Assessment; attempt: AssessmentAttempt; blocked: boolean; onClose(): void; onSaved(message: string): void; refresh(): void }
export default function ResultEditor({ actorId, snapshot, assessment, attempt, blocked, onClose, onSaved, refresh }: Props) {
  const [context, setContext] = useState(() => assessmentContext(snapshot, actorId));
  const [original, setOriginal] = useState(attempt);
  const [results, setResults] = useState(attempt.results);
  const [conflicts, setConflicts] = useState<ReturnType<typeof reconcileAssessmentResults>["conflicts"]>([]);
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [query, setQuery] = useState(""); const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const { requestAction } = useUnsavedChangesGuard();
  const prefix = useId();
  const now = useAssessmentClock();
  const opened = canRecordAssessmentResults(original, now);
  const stale = assessmentContextChanged(context, snapshot, actorId);
  const dirty = results.some((entry) => outcomeValue(entry.outcome) !== outcomeValue(original.results.find((item) => item.studentId === entry.studentId)?.outcome ?? null));
  useUnsavedChangesWarning(dirty || busy);
  const locked = busy || blocked || stale || !opened || original.state !== "draft";
  const students = assessment.roster.filter((student) => original.studentIds.includes(student.studentId));
  const view = paginate(students.filter((student) => (!conflictsOnly || !conflicts.length || conflicts.some((entry) => entry.studentId === student.studentId)) && matchesSearchText(`${student.name} ${student.studentNumber ?? ""}`, query)), page);
  const completed = results.filter((entry) => entry.outcome !== null).length;
  const close = () => { if (!busy) requestAction(onClose); };
  const review = async () => {
    setBusy(true); setError("");
    try {
      const latest = await assessmentService.read(actorId);
      const next = latest.assessments.find((item) => item.id === assessment.id)?.attempts.find((item) => item.id === original.id);
      if (!next || next.teacherId !== actorId || next.state !== "draft") throw new Error("Ведомость больше недоступна для редактирования. Ввод сохранён; вернитесь к аттестации и проверьте её состояние.");
      const merged = reconcileAssessmentResults(original.results, results, next.results);
      // A repeated refresh must not silently accept an unresolved conflict from an earlier refresh.
      const retained = conflicts.filter((entry) => !merged.conflicts.some((conflict) => conflict.studentId === entry.studentId)).flatMap((entry) => {
        const local = merged.results.find((item) => item.studentId === entry.studentId)?.outcome ?? null;
        const saved = next.results.find((item) => item.studentId === entry.studentId)?.outcome ?? null;
        return outcomeValue(local) === outcomeValue(saved) ? [] : [{ studentId: entry.studentId, local, saved }];
      });
      const unresolved = [...merged.conflicts, ...retained];
      setOriginal(next); setResults(merged.results); setConflicts(unresolved); setContext(assessmentContext(latest, actorId)); refresh();
      if (unresolved.length) { setConflictsOnly(true); setQuery(""); setPage(1); }
      setNotice(unresolved.length ? "Изменения в разных строках объединены. В строках с конфликтами выберите, какой результат оставить." : "Данные перепроверены. Изменения в нетронутых строках приняты из сохранённой ведомости; ваш ввод сохранён.");
    } catch (failure) { console.error("Не удалось перепроверить ведомость:", failure); setError(failure instanceof Error ? failure.message : "Не удалось обновить данные. Ввод сохранён."); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (locked || !dirty || conflicts.length) return;
    setBusy(true); setError("");
    try { await assessmentService.execute({ ...context, type: "save-results", assessmentId: assessment.id, attemptId: original.id, results }); onSaved("Черновик ведомости сохранён. Студенты увидят результаты после публикации."); }
    catch (failure) { console.error("Не удалось сохранить результаты аттестации:", failure); setError(failure instanceof Error ? failure.message : "Не удалось сохранить ведомость. Ввод остался в форме."); }
    finally { setBusy(false); }
  };
  return <RecordEditor title="Заполнение ведомости" context={`${assessment.title} · ${ATTEMPT_KIND_LABELS[original.kind]} № ${original.number} · ${displayDate(original.date)}, ${original.startsAt} (Москва)`} dirty={dirty} busy={busy} onClose={close} closeLabel="К аттестации">
    {!opened && <p className={styles.warning} role="status">Внесение результатов откроется {displayDate(original.date)} в {original.startsAt} по московскому времени. Сейчас доступен просмотр.</p>}
    {stale && <div className={styles.warning} role="alert"><p>Ведомость или справочники изменились. Ввод сохранён; перед сохранением требуется перепроверка.</p><button type="button" disabled={busy} onClick={() => void review()}>Обновить данные для проверки</button></div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {conflicts.length > 0 && <div className={styles.warning} role="alert"><p>Неразрешённых конфликтов: {conflicts.length}. Сохранение заблокировано, пока не выбран результат в каждой конфликтной строке.</p><button type="button" onClick={() => { setConflictsOnly(!conflictsOnly); setQuery(""); setPage(1); }}>{conflictsOnly ? "Показать всех участников" : "Показать конфликты"}</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <div className={styles.sectionHeader}><span>Заполнено: {completed} из {results.length}</span><span className={styles.note}>{assessment.kind === "pass" ? "Зачтено / не зачтено" : "Шкала 2–5"} · неявка отдельно</span></div>
      <SearchField label="Поиск студента в ведомости" value={query} placeholder="" onChange={(value) => { setQuery(value); setPage(1); }} />
      <ul className={styles.resultList}>{view.items.map((student, index) => {
        const id = `${prefix}-${index}`;
        const value = outcomeValue(results.find((entry) => entry.studentId === student.studentId)?.outcome ?? null);
        const saved = original.results.find((entry) => entry.studentId === student.studentId)?.outcome ?? null;
        const conflict = conflicts.find((entry) => entry.studentId === student.studentId);
        return <li key={student.studentId} className={styles.resultRow}><div><label htmlFor={id}>{student.name}</label><small>{student.studentNumber ?? "Номер зачётки не указан"}</small>{value !== outcomeValue(saved) && <small>Сохранено: {assessmentOutcomeLabel(saved)}</small>}{conflict && <div className={styles.conflict}><p>Введено: {assessmentOutcomeLabel(results.find((entry) => entry.studentId === student.studentId)?.outcome ?? null)} · сохранено другим изменением: {assessmentOutcomeLabel(saved)}</p><div className={styles.actions}><button type="button" disabled={locked} onClick={() => setConflicts((previous) => previous.filter((entry) => entry.studentId !== student.studentId))}>Оставить мой ввод</button><button type="button" disabled={locked} onClick={() => { setResults((previous) => previous.map((entry) => entry.studentId === student.studentId ? { ...entry, outcome: saved } : entry)); setConflicts((previous) => previous.filter((entry) => entry.studentId !== student.studentId)); }}>Принять сохранённое</button></div></div>}</div><select id={id} aria-label={`Результат: ${student.name}`} value={value} disabled={locked} onChange={(event) => {
          try { const outcome = parseOutcome(event.target.value); setResults((previous) => previous.map((entry) => entry.studentId === student.studentId ? { ...entry, outcome } : entry)); setConflicts((previous) => previous.filter((entry) => entry.studentId !== student.studentId)); setError(""); }
          catch (failure) { console.error("Не удалось изменить результат в ведомости:", failure); setError("Не удалось выбрать результат. Повторите попытку."); }
        }}><option value="">Не выставлено</option>{assessment.kind === "pass" ? <><option value="passed">Зачтено</option><option value="failed">Не зачтено</option></> : [2, 3, 4, 5].map((grade) => <option key={grade} value={grade}>{grade}</option>)}<option value="absent">Неявка</option></select></li>;
      })}</ul>
      {!view.items.length && <p className={styles.note}>Студент не найден.</p>}
      <Pagination {...view} onChange={setPage} />
      <RecordEditorActions label="Сохранить черновик" disabled={locked || !dirty || conflicts.length > 0} busy={busy} onCancel={close} hint="Можно сохранить незаполненную ведомость. Публикация доступна отдельно, когда результат указан у каждого участника." />
    </form>
  </RecordEditor>;
}
