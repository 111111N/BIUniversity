import { useEffect, useState } from "react";
import { roomsService } from "../../data/roomsStore";
import { roomLabel, type Room, type RoomContext } from "../../domain/rooms";
import styles from "../adminPrograms/index.module.scss";

function Snapshot({ room, label }: { room: Room; label: string }) {
  return <details><summary>{label}: {roomLabel(room)}</summary><p>{room.status === "active" ? "Действующая" : "В архиве"} · мест: {room.capacity ?? "не указано"}</p><p>Оснащение: {room.equipment.join(", ") || "не указано"}</p><p>Прежние названия: {room.aliases.join(", ") || "не указаны"}</p></details>;
}
export default function RoomHistory({ context, roomId }: { context: RoomContext; roomId: string }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [response, setResponse] = useState<{ key: string; data?: Awaited<ReturnType<typeof roomsService.history>>; error: string } | null>(null), key = JSON.stringify([context, roomId, page]);
  useEffect(() => {
    if (!open) return; let current = true;
    void roomsService.history(context, roomId, page).then(data => { if (current) setResponse({ key, data, error: "" }); })
      .catch(error => { console.error("Не удалось загрузить историю аудитории:", error); if (current) setResponse({ key, error: error instanceof Error ? error.message : "История недоступна." }); });
    return () => { current = false; };
  }, [context, roomId, page, open, key]);
  const source = response?.key === key ? response : null;
  return <details className={styles.historyPanel} onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}><summary>История аудитории</summary>{open && <>{!source && <p role="status">Загружаем историю…</p>}{source?.error && <p role="alert">{source.error}</p>}<ol className={styles.history}>{source?.data?.items.map(event => <li key={event.id}><strong>{new Date(event.occurredAt).toLocaleString("ru-RU")} · {event.actorName}</strong>{event.before ? <Snapshot room={event.before} label="Было" /> : <p>Создана аудитория</p>}<Snapshot room={event.after} label="Стало" /></li>)}</ol>{source?.data && source.data.pages > 1 && <nav className={styles.actions} aria-label="Страницы истории аудитории"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button><span>{page} / {source.data.pages}</span><button type="button" disabled={page >= source.data.pages} onClick={() => setPage(page + 1)}>Далее</button></nav>}</>}</details>;
}
