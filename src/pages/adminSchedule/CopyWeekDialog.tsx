import { useId, useMemo, useRef, useState } from "react";
import { useRole } from "../../components/RoleContext";
import Modal from "../../components/Modal";
import Dropdown from "../../components/Dropdown";
import { previewManagedScheduleCopy, verifyManagedScheduleCopy, type ScheduleCopyPreview } from "../../data/managedScheduleStore";
import { getAcademicSubjectDefinition } from "../../data/academicCatalog";
import type { ManagedLesson, ManagedScheduleSnapshot } from "../../domain/scheduleManagement";
import type { ScheduleCopyRequest } from "../../domain/scheduleCopy";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import { lessonTypeLabels } from "../../domain/academic";
import styles from "./CopyWeekDialog.module.scss";

const PAGE_SIZE = 20;
const dateLabel = (date: string) => parseCalendarDate(date)?.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) ?? date;
const weekLabel = (week: string) => {
  const end = parseCalendarDate(week);
  if (!end) return week;
  end.setDate(end.getDate() + 5);
  return `${dateLabel(week)} — ${dateLabel(toLocalDateKey(end))}`;
};
interface Props {
  snapshot: ManagedScheduleSnapshot;
  groupId: string;
  groupName: string;
  targetWeekStart: string;
  currentLessonCount: number;
  hasUnsavedChanges: boolean;
  onApply(lessons: ManagedLesson[]): void;
  onClose(): void;
}
export default function CopyWeekDialog({ snapshot, groupId, groupName, targetWeekStart, currentLessonCount, hasUnsavedChanges, onApply, onClose }: Props) {
  const { currentUser } = useRole();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const sources = useMemo(() => (["published", "draft"] as const).flatMap((source) =>
    (source === "draft" ? snapshot.drafts : snapshot.published).filter((week) => week.groupId === groupId && week.weekStart !== targetWeekStart && week.lessons.length).map((week) => ({ source, weekStart: week.weekStart, count: week.lessons.length, key: `${source}:${week.weekStart}` })),
  ).sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.source.localeCompare(b.source)), [snapshot, groupId, targetWeekStart]);
  const [sourceKey, setSourceKey] = useState("");
  const [preview, setPreview] = useState<ScheduleCopyPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const source = sources.find((entry) => entry.key === sourceKey);
  const stale = Boolean(preview && preview.scheduleRevision !== snapshot.revision);
  const sorted = useMemo(() => preview ? [...preview.lessons].sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt)) : [], [preview]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const prepare = async () => {
    if (!source || busy) return;
    setBusy(true); setError(""); setPreview(null); setPage(1);
    try {
      const request: ScheduleCopyRequest = { source: source.source, sourceWeekStart: source.weekStart, targetWeekStart, groupId };
      setPreview(await previewManagedScheduleCopy({ actorId: currentUser.id, request }));
    } catch (reason) { console.error("Не удалось проверить копирование недели в форме:", reason); setError(reason instanceof Error ? reason.message : "Не удалось подготовить копию."); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview || busy || stale) return;
    setBusy(true); setError("");
    try {
      await verifyManagedScheduleCopy({ actorId: currentUser.id, versions: preview });
      onApply(structuredClone(preview.lessons));
    } catch (reason) { console.error("Не удалось перенести копию в рабочую неделю:", reason); setError(reason instanceof Error ? reason.message : "Не удалось применить копию. Повторите проверку."); }
    finally { setBusy(false); }
  };
  return <Modal labelledBy={titleId} initialFocusRef={closeRef} onClose={() => { if (!busy) onClose(); }} className={styles.dialog}>
    <header className={styles.header}><div><h2 id={titleId}>Копировать неделю</h2><p>{groupName} · в неделю {weekLabel(targetWeekStart)}</p></div><button ref={closeRef} type="button" disabled={busy} onClick={onClose}>Закрыть</button></header>
    <p className={styles.note}>Копируются занятия этой группы с сохранением дней недели, времени, преподавателей и аудиторий. Выберите сохранённый черновик или опубликованное расписание.</p>
    {sources.length ? <div className={styles.source}><Dropdown searchable label="Неделя для копирования" placeholder="" value={sourceKey} options={sources.map((entry) => ({ value: entry.key, label: `${weekLabel(entry.weekStart)} · ${entry.source === "draft" ? "Черновик" : "Опубликовано"} · Занятий: ${entry.count}` }))} disabled={busy} onChange={(key) => { setSourceKey(key); setPreview(null); setError(""); }} /><button type="button" disabled={busy || !source} onClick={() => void prepare()}>{busy ? "Проверяем…" : preview ? "Повторить проверку" : "Проверить копирование"}</button></div> : <p className={styles.empty}>Нет сохранённых недель с занятиями для этой группы. Сначала сохраните исходную неделю как черновик или опубликуйте её.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {preview && <section className={styles.preview} aria-label="Предпросмотр копии недели">
      <div className={styles.summary} role="status"><strong>Будет скопировано: {preview.lessons.length}</strong><span>Конфликтов: {preview.conflicts.length}</span></div>
      {(currentLessonCount > 0 || hasUnsavedChanges) && <p className={styles.warning}>В рабочей неделе сейчас занятий: {currentLessonCount}.{hasUnsavedChanges ? " Есть несохранённые изменения." : ""} Применение копии заменит этот список целиком. Опубликованное расписание пока сохранится.</p>}
      {preview.issues.length > 0 && <div className={styles.warning}><strong>Нужно исправить перед сохранением</strong><ul>{preview.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><p>Можно перенести копию в рабочую неделю и исправить занятия там.</p></div>}
      {preview.conflicts.length > 0 && <details className={styles.warning} open><summary>Конфликты на новой неделе</summary><ul>{preview.conflicts.map((conflict, index) => <li key={index}>{conflict.message}</li>)}</ul><p>Сохранить черновик с конфликтами можно; публикация потребует их устранения.</p></details>}
      <ul className={styles.lessons}>{sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((lesson) => <li key={lesson.id}><div><strong>{dateLabel(lesson.date)}</strong><span>{lesson.startsAt}–{lesson.endsAt}</span></div><div><strong>{getAcademicSubjectDefinition(lesson.subjectId)?.name ?? "Дисциплина недоступна"}</strong><span>{lessonTypeLabels[lesson.type]} · {lesson.teacherName} · Ауд. {lesson.room}</span></div></li>)}</ul>
      {pageCount > 1 && <nav className={styles.pagination} aria-label="Страницы предпросмотра копии"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</button><span>{page} / {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setPage(page + 1)}>Далее</button></nav>}
      <p className={styles.note}>Проверьте чётность недели и учебный календарь. Каникулы и учебные периоды пока не учитываются автоматически.</p>
      {stale && <p className={styles.error} role="alert">Расписание изменилось. Повторите проверку перед применением копии.</p>}
      <footer className={styles.footer}><p>После переноса сохраните черновик. Публикация выполняется отдельно.</p><button type="button" className={styles.primary} disabled={busy || stale} onClick={() => void apply()}>{busy ? "Проверяем…" : currentLessonCount > 0 || hasUnsavedChanges ? "Заменить рабочую неделю" : "Перенести в рабочую неделю"}</button></footer>
    </section>}
  </Modal>;
}
