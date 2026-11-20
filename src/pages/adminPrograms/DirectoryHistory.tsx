import { useEffect, useRef, useState } from "react";
import { educationDirectoriesService } from "../../data/educationDirectoriesStore";
import type { EducationDirectoryContext, EducationDirectoryEvent } from "../../domain/educationDirectories";
import styles from "./index.module.scss";

export default function DirectoryHistory({ context, entity, entityId }: { context: EducationDirectoryContext; entity: "program" | "form"; entityId: string }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; items?: EducationDirectoryEvent[]; total?: number; pages?: number; error?: string }>({ key: "" });
  const generation = useRef(0), key = JSON.stringify([context, entity, entityId, page, retry]);
  useEffect(() => {
    if (!open) return;
    const request = ++generation.current;
    void educationDirectoriesService.history({ ...context, entity, entityId, page }).then(result => {
      if (generation.current === request) setState({ key, ...result });
    }).catch(error => {
      console.error("Не удалось загрузить историю учебного справочника:", error);
      if (generation.current === request) setState({ key, error: error instanceof Error ? error.message : "История недоступна." });
    });
    return () => { if (generation.current === request) generation.current = request + 1; };
  }, [open, context, entity, entityId, page, retry, key]);
  const current = state.key === key ? state : undefined;
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>История изменений</summary>
    {open && <>{!current && <p role="status">Загрузка истории…</p>}{current?.error && <p role="alert">{current.error} <button type="button" onClick={() => setRetry(value => value + 1)}>Повторить</button></p>}
      {current?.items && <><p className={styles.note}>Событий: {current.total}</p><ol className={styles.history}>{current.items.map(event => <li key={event.id}><strong>{event.before ? "Изменено" : "Создано"}</strong> · {new Date(event.occurredAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} (Москва)<p>{event.before && <>{event.before.name}{"code" in event.before && event.before.code ? ` · ${event.before.code}` : ""} → </>}{event.after.name}{"code" in event.after && event.after.code ? ` · ${event.after.code}` : ""}</p></li>)}</ol><nav className={styles.actions} aria-label="Страницы истории"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Назад</button><span>{page} / {current.pages}</span><button type="button" disabled={page >= (current.pages ?? 1)} onClick={() => setPage(value => value + 1)}>Далее</button></nav></>}
    </>}
  </details>;
}
