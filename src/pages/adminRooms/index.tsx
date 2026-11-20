import { useEffect, useRef, useState, type FormEvent } from "react";
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
import useRooms from "../../hooks/useRooms";
import { roomsService } from "../../data/roomsStore";
import { roomLabel, type Room, type RoomContext } from "../../domain/rooms";
import { matchesSearchText } from "../../domain/search";
import RoomHistory from "./History";
import styles from "../adminPrograms/index.module.scss";

interface Form { name: string; building: string; capacity: string; equipment: string; aliases: string }
interface Editor { record?: Room; context: RoomContext; value: Form; initial: string }
const toForm = (room?: Room): Form => ({ name: room?.name ?? "", building: room?.building ?? "", capacity: room?.capacity?.toString() ?? "", equipment: room?.equipment.join("\n") ?? "", aliases: room?.aliases.join("\n") ?? "" });
const lines = (value: string) => value.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);

function RoomsWorkspace({ actorId }: { actorId: string }) {
  const source = useRooms(actorId), [params, setParams] = useSearchParams(), guard = useUnsavedChangesGuard();
  const [editor, setEditor] = useState<Editor | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const generation = useRef(0), pending = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const dirty = Boolean(editor && editor.initial !== JSON.stringify(editor.value)), stale = Boolean(editor && source.snapshot && JSON.stringify(editor.context) !== JSON.stringify(source.snapshot.context));
  useUnsavedChangesWarning(dirty || busy);
  const query = params.get("q") ?? "", status = params.get("status") ?? "active", building = params.get("building") ?? "all", pageText = params.get("page") ?? "1", page = Number(pageText);
  const buildings = [...new Set((source.snapshot?.rooms ?? []).map(room => room.building))].sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
  const queryError = query.length > 256 ? "Поисковый запрос должен содержать не более 256 символов." : !["active", "archived", "all"].includes(status) ? "Состояние в ссылке некорректно." : building !== "all" && !buildings.includes(building) && !source.loading && source.snapshot ? "Корпус из ссылки недоступен. Выберите другой фильтр." : !/^[1-9]\d*$/u.test(pageText) || !Number.isSafeInteger(page) ? "Номер страницы некорректен." : "";
  const rows = queryError ? [] : (source.snapshot?.rooms ?? []).filter(room => (status === "all" || room.status === status) && (building === "all" || room.building === building) && matchesSearchText([roomLabel(room), ...room.equipment, ...room.aliases].join(" "), query)).sort((a, b) => roomLabel(a).localeCompare(roomLabel(b), "ru", { numeric: true }));
  const pages = Math.max(1, Math.ceil(rows.length / 20)), currentPage = Math.min(page || 1, pages);
  const change = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); next.set(key, value); if (key !== "page") next.delete("page"); return next; });
  const open = (record?: Room) => { if (!source.snapshot || source.loading) return; const value = toForm(record); setEditor({ record, context: source.snapshot.context, value, initial: JSON.stringify(value) }); setError(""); setMessage(""); };
  const close = () => { if (busy) return; const leave = () => { setEditor(null); setError(""); }; if (dirty) guard.requestAction(leave); else leave(); };
  const run = async (action: "save" | "archive" | "restore", record?: Room, event?: FormEvent) => {
    event?.preventDefault(); if (pending.current || !source.snapshot || source.loading || source.error || action === "save" && (!editor || stale)) return;
    const context = action === "save" ? editor!.context : source.snapshot.context;
    const token = ++generation.current; pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (action === "save") {
        const value = editor!.value;
        if (value.capacity.trim() && !/^[1-9]\d*$/u.test(value.capacity.trim())) throw new Error("Укажите целое положительное число мест или оставьте поле пустым.");
        await roomsService.execute({ ...context, type: "save", roomId: editor!.record?.id, roomRevision: editor!.record?.revision, draft: { name: value.name, building: value.building, capacity: value.capacity.trim() ? Number(value.capacity.trim()) : null, equipment: lines(value.equipment), aliases: lines(value.aliases) } });
      } else if (record) await roomsService.execute({ ...context, type: action, roomId: record.id, roomRevision: record.revision });
      if (generation.current === token) { setEditor(null); setMessage(action === "save" ? "Аудитория сохранена." : action === "archive" ? "Аудитория перенесена в архив. История и опубликованные подписи сохранены." : "Аудитория восстановлена."); source.refresh(); }
    } catch (failure) { console.error("Не удалось выполнить действие с аудиторией:", failure); if (generation.current === token) setError(failure instanceof Error ? failure.message : "Изменения не сохранены."); }
    finally { if (generation.current === token) { pending.current = false; setBusy(false); } }
  };
  const review = async () => {
    if (!editor || pending.current) return; const token = ++generation.current; pending.current = true; setBusy(true); setError("");
    try { const latest = await roomsService.read(actorId); if (generation.current !== token) return; if (editor.record && latest.rooms.find(room => room.id === editor.record?.id)?.revision !== editor.record.revision) throw new Error("Карточка аудитории изменилась. Сохраните свой ввод и откройте её актуальную версию."); setEditor({ ...editor, context: latest.context }); source.refresh(); }
    catch (failure) { console.error("Не удалось перепроверить аудиторию:", failure); if (generation.current === token) setError(failure instanceof Error ? failure.message : "Проверка недоступна."); }
    finally { if (generation.current === token) { pending.current = false; setBusy(false); } }
  };
  const field = (key: keyof Form, value: string) => { if (editor) setEditor({ ...editor, value: { ...editor.value, [key]: value } }); };
  return <div className={`pageContainer ${styles.page}`}><AdministrationReturnNotice /><nav className={styles.actions}><Link to="/admin/schedule">Редактор расписания</Link><Link to="/admin/schedule/overview">Обзор публикаций</Link></nav>
    {(source.error || error) && <p className={styles.error} role="alert">{source.error || error}</p>}{message && <p role="status">{message}</p>}
    {editor ? <RecordEditor title={editor.record ? "Изменить аудиторию" : "Новая аудитория"} dirty={dirty} busy={busy} onClose={close}><form className={styles.form} onSubmit={event => void run("save", editor.record, event)}>
      <label className={styles.field}>Корпус<input required maxLength={160} value={editor.value.building} disabled={busy} onChange={event => field("building", event.target.value)} /></label>
      <label className={styles.field}>Название или номер<input required maxLength={160} value={editor.value.name} disabled={busy} onChange={event => field("name", event.target.value)} /></label>
      <label className={styles.field}>Количество мест<input type="number" min={1} max={1000000} step={1} value={editor.value.capacity} disabled={busy} onChange={event => field("capacity", event.target.value)} /></label>
      <label className={styles.field}>Оснащение, по одному пункту в строке<textarea rows={4} maxLength={16200} value={editor.value.equipment} disabled={busy} onChange={event => field("equipment", event.target.value)} /></label>
      <label className={styles.field}>Прежние названия, по одному в строке<textarea rows={4} maxLength={16200} value={editor.value.aliases} disabled={busy} onChange={event => field("aliases", event.target.value)} /></label>
      <p className={styles.note}>Вместимость и оснащение необязательны. Прежние названия помогают находить возможные пересечения; пары связываются с карточкой только при явном выборе аудитории.</p>
      {stale && <div className={styles.error}><p>Источники изменились. Перепроверьте форму перед сохранением.</p><button type="button" disabled={busy} onClick={() => void review()}>Перепроверить</button></div>}
      <RecordEditorActions label="Сохранить" disabled={busy || source.loading || Boolean(source.error) || stale || !dirty} busy={busy} onCancel={close} />
    </form></RecordEditor> : <><Card className={styles.toolbar}><div className={styles.actions}><h1>Аудитории</h1><button className={styles.primary} type="button" disabled={busy || source.loading || !source.snapshot} onClick={() => open()}>Создать аудиторию</button></div><SearchField label="Поиск аудитории, корпуса или оснащения" value={query} placeholder="" onChange={value => change("q", value.slice(0, 256))} /><div className={styles.actions}><Dropdown label="Корпус" value={building} options={[{ value: "all", label: "Все корпуса" }, ...buildings.map(value => ({ value, label: value }))]} onChange={value => change("building", value)} /><Dropdown label="Состояние" value={status} options={[{ value: "active", label: "Действующие" }, { value: "archived", label: "В архиве" }, { value: "all", label: "Все" }]} onChange={value => change("status", value)} /></div></Card>
      {queryError && <Card><p role="alert">{queryError}</p><button type="button" onClick={() => setParams(previous => { const next = new URLSearchParams(previous); ["q", "status", "building", "page"].forEach(key => next.delete(key)); return next; }, { replace: true })}>Сбросить фильтры</button></Card>}
      {source.loading && <p role="status">Загружаем аудитории…</p>}
      {source.snapshot && !source.loading && !queryError && !rows.length && <Card>Аудитории не найдены.</Card>}
      {!source.loading && rows.slice((currentPage - 1) * 20, currentPage * 20).map(room => <Card className={styles.card} key={room.id}><h2>{roomLabel(room)}{room.status === "archived" ? " · архив" : ""}</h2><p>Мест: {room.capacity ?? "не указано"}</p><p>Оснащение: {room.equipment.join(", ") || "не указано"}</p>{room.aliases.length > 0 && <p>Прежние названия: {room.aliases.join(", ")}</p>}<div className={styles.actions}>{room.status === "active" && <button type="button" disabled={busy} onClick={() => open(room)}>Изменить</button>}<button type="button" disabled={busy} onClick={() => void run(room.status === "active" ? "archive" : "restore", room)}>{room.status === "active" ? "В архив" : "Восстановить"}</button></div>{source.snapshot && <RoomHistory context={source.snapshot.context} roomId={room.id} />}</Card>)}
      {pages > 1 && <nav className={styles.actions} aria-label="Страницы аудиторий"><button type="button" disabled={currentPage <= 1 || busy} onClick={() => change("page", String(currentPage - 1))}>Назад</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages || busy} onClick={() => change("page", String(currentPage + 1))}>Далее</button></nav>}
    </>}{source.error && <button type="button" onClick={source.refresh}>Повторить чтение</button>}
  </div>;
}
export default function RoomsPage() { const { currentUser } = useRole(); return <RoomsWorkspace key={currentUser.id} actorId={currentUser.id} />; }
