import { useState, type FormEvent } from "react";
import type { Assessment, AssessmentSnapshot } from "../../domain/assessmentTypes";
import { assessmentService } from "../../data/assessmentStore";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import RecordBookFields, { parseRecordBookDraft, recordBookDraft } from "./RecordBookFields";
import { assessmentContext, assessmentContextChanged } from "./model";
import styles from "./index.module.scss";

export default function RecordBookEditor({ assessment, snapshot, actorId, blocked, onClose, onSaved, refresh }: { assessment: Assessment; snapshot: AssessmentSnapshot; actorId: string; blocked: boolean; onClose(): void; onSaved(message: string): void; refresh(): void }) {
  const [context, setContext] = useState(() => assessmentContext(snapshot, actorId));
  const [initial, setInitial] = useState(() => recordBookDraft(assessment.recordBook));
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const { requestAction } = useUnsavedChangesGuard();
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const stale = assessmentContextChanged(context, snapshot, actorId);
  const value = parseRecordBookDraft(draft);
  useUnsavedChangesWarning(dirty || busy);
  const close = () => { if (!busy) requestAction(onClose); };
  const review = async () => {
    setBusy(true); setError("");
    try {
      const latest = await assessmentService.read(actorId);
      const next = latest.assessments.find((entry) => entry.id === assessment.id);
      if (!next) throw new Error("Аттестация недоступна. Ввод сохранён; вернитесь к списку.");
      const saved = recordBookDraft(next.recordBook);
      if (JSON.stringify(saved) !== JSON.stringify(initial)) throw new Error("Семестр, часы или раздел изменены другим пользователем. Ввод сохранён. Вернитесь к аттестации и откройте актуальные реквизиты заново.");
      setInitial(saved); setContext(assessmentContext(latest, actorId)); refresh();
    } catch (failure) { console.error("Не удалось перепроверить реквизиты зачётки:", failure); setError(failure instanceof Error ? failure.message : "Перепроверка не удалась. Ввод сохранён."); }
    finally { setBusy(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!value || !dirty || busy || blocked || stale) return;
    setBusy(true); setError("");
    try { await assessmentService.execute({ ...context, type: "update-record-book", assessmentId: assessment.id, recordBook: value }); onSaved("Реквизиты зачётки сохранены. Результаты и история попыток не изменены."); }
    catch (failure) { console.error("Не удалось сохранить реквизиты зачётки:", failure); setError(failure instanceof Error ? failure.message : "Сохранение не удалось. Ввод сохранён."); }
    finally { setBusy(false); }
  };
  return <RecordEditor title="Реквизиты зачётки" context={assessment.title} dirty={dirty} busy={busy} onClose={close} closeLabel="К аттестации">
    <p className={styles.note}>Эти сведения определяют семестр и раздел в зачётке всех участников этой аттестации.</p>
    {stale && <div className={styles.warning} role="alert"><p>Исходные данные изменились. Ввод сохранён; перепроверьте данные перед записью.</p><button type="button" disabled={busy} onClick={() => void review()}>Обновить проверку</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <form className={styles.form} onSubmit={(event) => void save(event)}><RecordBookFields value={draft} onChange={setDraft} disabled={busy || blocked || stale} /><RecordEditorActions label="Сохранить реквизиты" disabled={!value || !dirty || busy || blocked || stale} busy={busy} onCancel={close} /></form>
  </RecordEditor>;
}
