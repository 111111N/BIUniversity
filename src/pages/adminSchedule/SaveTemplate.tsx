import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRole } from "../../components/RoleContext";
import useScheduleTemplates from "../../hooks/useScheduleTemplates";
import { scheduleTemplatesService } from "../../data/scheduleTemplatesStore";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import styles from "../adminPrograms/index.module.scss";
export default function SaveTemplate({ publicationId, onBusyChange }: { publicationId: string; onBusyChange(busy: boolean): void }) {
  const { currentUser } = useRole(), source = useScheduleTemplates(currentUser.id), [name, setName] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const pending = useRef(false), generation = useRef(0), invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => invalidate, [invalidate]);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useUnsavedChangesWarning(Boolean(name.trim()) || busy);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (pending.current || !source.snapshot || source.loading || source.error) return;
    const token = ++generation.current; pending.current = true; setBusy(true); setError(""); setMessage("");
    try { await scheduleTemplatesService.execute({ ...source.snapshot.context, type: "create", publicationId, name }); if (generation.current === token) { setName(""); setMessage("Шаблон сохранён. Он доступен при копировании в нужную группу и неделю."); } }
    catch (failure) { console.error("Не удалось сохранить публикацию как шаблон:", failure); if (generation.current === token) setError(failure instanceof Error ? failure.message : "Шаблон не сохранён. Название сохранено в форме."); }
    finally { if (generation.current === token) { pending.current = false; setBusy(false); } }
  };
  return <details className={styles.historyPanel}><summary>Сохранить выбранную версию как шаблон</summary><form className={styles.form} onSubmit={save}><label className={styles.field}>Название шаблона<input required minLength={2} maxLength={160} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>{(error || source.error) && <p role="alert">{error || source.error}</p>}{message && <p role="status">{message}</p>}<div className={styles.actions}><button type="submit" disabled={busy || source.loading || Boolean(source.error) || !source.snapshot || name.trim().length < 2}>{busy ? "Сохраняем…" : "Сохранить шаблон"}</button>{source.error && <button type="button" disabled={busy} onClick={source.refresh}>Повторить чтение</button>}</div></form></details>;
}
