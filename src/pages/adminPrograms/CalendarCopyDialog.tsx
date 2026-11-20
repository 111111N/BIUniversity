import { useId, useRef, useState } from "react";
import Modal from "../../components/Modal";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import Dropdown from "../../components/Dropdown";
import { groupCalendarsService, type GroupCalendarsSnapshot } from "../../data/groupCalendarsStore";
import type { GroupCalendarContext } from "../../domain/groupCalendarTypes";
import { CalendarContentsList } from "./CalendarContents";
import styles from "./index.module.scss";

export default function CalendarCopyDialog({ snapshot, groupId, termId, onClose, onCopied }: { snapshot: GroupCalendarsSnapshot; groupId: string; termId: string; onClose(): void; onCopied(): void }) {
  const [sourceId, setSourceId] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [result, setResult] = useState<{ key: string; context: GroupCalendarContext; preview: Awaited<ReturnType<typeof groupCalendarsService.previewCopy>> } | null>(null);
  const pending = useRef(false), titleId = useId(), key = JSON.stringify([snapshot.context, sourceId, groupId, termId]);
  useUnsavedChangesWarning(busy);
  const preview = result?.key === key ? result.preview : undefined;
  const options = snapshot.calendars.filter(row => row.group.id !== groupId || row.period.term.id !== termId).map(row => ({ value: row.id, label: `${row.group.name} · ${row.period.year.name} · ${row.period.term.name}` }));
  const review = async () => {
    if (!sourceId || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { const next = await groupCalendarsService.previewCopy(snapshot.context, sourceId, groupId, termId); setResult({ key, context: snapshot.context, preview: next }); }
    catch (failure) { console.error("Не удалось проверить копирование календаря:", failure); setResult(null); setError(failure instanceof Error ? failure.message : "Копирование недоступно."); }
    finally { pending.current = false; setBusy(false); }
  };
  const copy = async () => {
    if (!preview || !result || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await groupCalendarsService.execute({ ...result.context, type: "copy", groupId, termId, sourceId, sourceRevision: preview.sourceRevision, calendarRevision: preview.calendarRevision }); onCopied(); }
    catch (failure) { console.error("Не удалось скопировать календарь:", failure); setError(failure instanceof Error ? failure.message : "Календарь не скопирован."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <Modal labelledBy={titleId} onClose={() => { if (!busy) onClose(); }} className={styles.calendarDialog}><div className={styles.form}><div className={styles.actions}><h2 id={titleId}>Копирование календаря</h2><button type="button" disabled={busy} onClick={onClose}>Закрыть</button></div>
    <Dropdown label="Календарь-источник" value={sourceId} options={options} disabled={busy} searchable onChange={value => { setSourceId(value); setError(""); }} />
    <p className={styles.note}>Даты сдвигаются относительно начала семестра назначения. Выходящие за его границы интервалы не обрезаются — такое копирование будет запрещено.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><button type="button" disabled={busy || !sourceId} onClick={() => void review()}>Проверить копию</button></div>
    {preview && <><p>{preview.sourceName}</p>{preview.replaces && <p className={styles.error}>Сохранённые интервалы и неучебные даты календаря назначения будут заменены. Предыдущий вариант останется в истории.</p>}<CalendarContentsList contents={preview.contents} /><div className={styles.actions}><button className={styles.primary} type="button" disabled={busy} onClick={() => void copy()}>{busy ? "Копируем…" : preview.replaces ? "Заменить календарь копией" : "Скопировать календарь"}</button></div></>}
  </div></Modal>;
}
