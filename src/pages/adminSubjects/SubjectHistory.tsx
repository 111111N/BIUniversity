import { useEffect, useState } from "react";
import { subjectCatalogService } from "../../data/subjectCatalogStore";
import type { SubjectChange, SubjectTargetCommand } from "../../domain/subjectCatalog";
import styles from "./index.module.scss";

export default function SubjectHistory({ command }: { command: SubjectTargetCommand }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const key = JSON.stringify([command, page, retry]);
  const [state, setState] = useState<{ key: string; items?: SubjectChange[]; pages?: number; error?: string } | null>(null);
  useEffect(() => {
    if (!open) return; let active = true;
    void subjectCatalogService.history({ ...command, page }).then(result => { if (active) setState({ key, ...result }); }).catch(error => { if (active) { console.error("Не удалось показать историю дисциплины:", error); setState({ key, error: error instanceof Error ? error.message : "История недоступна. Повторите загрузку." }); } });
    return () => { active = false; };
  }, [open, key, command, page]);
  const current = state?.key === key ? state : null;
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>История дисциплины</summary>{open && <div>
    {!current && <p role="status">Загружаем историю…</p>}
    {current?.error && <p role="alert">{current.error} <button type="button" onClick={() => setRetry(value => value + 1)}>Повторить</button></p>}
    {current?.items && <>{!current.items.length && <p className={styles.note}>История изменений ещё не велась.</p>}<ol>{current.items.map(item => <li key={item.id}>
      <strong>{{ created: "Дисциплина создана", updated: "Реквизиты изменены", archived: "Дисциплина архивирована", restored: "Дисциплина восстановлена" }[item.action]}</strong>
      <p className={styles.note}>{new Date(item.occurredAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} мск · {item.actorId}</p>
      {(item.before || item.after) && <p>{item.before ? `${item.before.name} (${item.before.shortName}) → ` : ""}{item.after?.name} ({item.after?.shortName})</p>}
      {item.origin === "saved-snapshot" && <p className={styles.note}>Значения до изменения сохранены из прежнего каталога. Ранняя история не создавалась.</p>}
    </li>)}</ol>{(current.pages ?? 1) > 1 && <nav className={styles.pagination} aria-label="Страницы истории дисциплины"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Назад</button><span> {page} / {current.pages} </span><button type="button" disabled={page >= current.pages!} onClick={() => setPage(value => value + 1)}>Далее</button></nav>}</>}
  </div>}</details>;
}
