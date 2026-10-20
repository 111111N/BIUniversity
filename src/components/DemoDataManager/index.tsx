import { useId, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { startOfWeek } from "date-fns";
import type { DemoImportResult } from "../../data/demoData";
import { parseCalendarDate } from "../../domain/calendar";
import Modal from "../Modal";
import Checkbox from "../Checkbox";
import { useRole } from "../RoleContext";
import styles from "./index.module.scss";

const DemoDataManager = () => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DemoImportResult | null>(null);
  const [error, setError] = useState("");
  const [includeJournals, setIncludeJournals] = useState(true);
  const { currentUser } = useRole();
  const [params] = useSearchParams();
  const headingId = useId();
  const lock = useRef(false);
  const anchor = parseCalendarDate(params.get("date")) ?? new Date();
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const importData = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const { importDemoData } = await import("../../data/demoData");
      setResult(await importDemoData(anchor, { journalActor: includeJournals && currentUser.role === "teacher" ? currentUser : undefined }));
    }
    catch { setError("Не удалось завершить наполнение. Повторите попытку: уже добавленные записи не продублируются."); }
    finally { lock.current = false; setBusy(false); }
  };
  return <>
    <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>Наполнить демоданными</button>
    {open && <Modal labelledBy={headingId} onClose={() => { if (!lock.current) setOpen(false); }} className={styles.dialog}>
      <header><span>Демо-режим</span><h2 id={headingId}>Больше данных для просмотра</h2><p>Задания по четырём предметам, ответы с историей попыток, материалы, задачи и недельная динамика журналов.</p></header>
      <div className={styles.scenarios}><span>Проверка и доработка</span><span>Оценки 2–5</span><span>Сроки и просрочки</span><span>Учебные и личные задачи</span></div>
      <p className={styles.hint}>Неделя начинается {weekStart.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}. Добавим примеры на эту и соседние недели, не меняя ваши записи. Повторное наполнение не создаёт дубликатов и не переносит уже добавленные примеры на другую неделю.</p>
      {currentUser.role === "teacher" && <div className={styles.journalOption}>
        <Checkbox label="Добавить демонстрационные отметки в мои журналы" checked={includeJournals} disabled={busy} onChange={setIncludeJournals} />
        <p>С 14 сентября по 6 ноября 2026: разные недели, оценки 5/4/3/2, пропуски и неделя без оценок по анализу данных. Заполняются только отсутствующие ячейки прошедших занятий; будущие остаются пустыми. Уже сохранённые отметки, даже «не отмечено» и пустая оценка, не заменяются. Каждый импорт отмечается в истории журнала.</p>
      </div>}
      <p className={styles.localNotice}>Данные сохраняются только в этом браузере. Вложенные TXT-файлы можно открыть и скачать — это учебные примеры, не материалы университета.</p>
      {busy && <p className={styles.progress} role="status">Подготавливаем журналы, задания, ответы и файлы. Закрыть окно можно после завершения.</p>}
      {result && <div className={styles.result} role="status"><strong>{result.assignments + result.submissions + result.tasks + result.materials + result.journalCells ? result.warnings.length ? "Часть данных добавлена" : "Данные добавлены" : result.warnings.length ? "Наполнение не завершено" : "Этот набор уже добавлен"}</strong><dl><div><dt>Заданий</dt><dd>+{result.assignments}</dd></div><div><dt>Ответов</dt><dd>+{result.submissions}</dd></div><div><dt>Задач</dt><dd>+{result.tasks}</dd></div><div><dt>Материалов</dt><dd>+{result.materials}</dd></div><div><dt>Журналов дополнено</dt><dd>{result.journals}</dd></div><div><dt>Ячеек журнала</dt><dd>+{result.journalCells}</dd></div><div><dt>Оценок</dt><dd>+{result.grades}</dd></div></dl>{result.warnings.map((warning) => <p className={styles.error} key={warning}>{warning}</p>)}</div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={() => setOpen(false)}>Закрыть</button><button type="button" className={styles.primary} disabled={busy} onClick={() => { void importData(); }}>{busy ? "Добавляем данные…" : result?.warnings.length ? "Повторить наполнение" : "Добавить примеры"}</button></footer>
    </Modal>}
  </>;
};

export default DemoDataManager;
