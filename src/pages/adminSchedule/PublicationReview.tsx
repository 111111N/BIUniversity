import { useEffect, useId, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import Dropdown from "../../components/Dropdown";
import { useRole } from "../../components/RoleContext";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { previewManagedSchedulePublication, publishManagedScheduleDraft, type SchedulePublicationPreview } from "../../data/managedScheduleStore";
import { getAcademicGroup, getAcademicSubjectDefinition } from "../../data/academicCatalog";
import { PUBLICATION_FIELD_LABELS, type PublicationChangeField, type PublicationChangeKind } from "../../domain/schedulePublication";
import type { ManagedLesson, ManagedScheduleSnapshot } from "../../domain/scheduleManagement";
import { parseCalendarDate } from "../../domain/calendar";
import { lessonTypeLabels } from "../../domain/academic";
import base from "./CopyWeekDialog.module.scss";
import styles from "./PublicationReview.module.scss";

const PAGE_SIZE = 20;
const labels: Record<PublicationChangeKind, string> = { added: "Добавится", changed: "Изменится", removed: "Будет убрано" };
const dateLabel = (date: string) => parseCalendarDate(date)?.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) ?? date;
const fieldValue = (lesson: ManagedLesson, field: PublicationChangeField) => {
  if (field === "subjectId") return getAcademicSubjectDefinition(lesson.subjectId)?.name ?? "Дисциплина недоступна";
  if (field === "groupId") return getAcademicGroup(lesson.groupId)?.name ?? "Группа недоступна";
  if (field === "teacherId") return lesson.teacherName;
  if (field === "date") return dateLabel(lesson.date);
  if (field === "type") return lessonTypeLabels[lesson.type];
  return lesson[field];
};
const LessonSummary = ({ label, lesson }: { label: string; lesson: ManagedLesson }) => <div><h4>{label}</h4><p>{dateLabel(lesson.date)} · {lesson.startsAt}–{lesson.endsAt}</p><p>{lessonTypeLabels[lesson.type]} · {lesson.teacherName}</p><p>Ауд. {lesson.room}</p></div>;

interface Props {
  groupId: string;
  groupName: string;
  weekStart: string;
  revision: number;
  onClose(): void;
  onPublished(snapshot: ManagedScheduleSnapshot): void;
}
export default function PublicationReview({ groupId, groupName, weekStart, revision, onClose, onPublished }: Props) {
  const { currentUser } = useRole();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [reload, setReload] = useState(0);
  const [reviewRevision, setReviewRevision] = useState(revision);
  const request = useMemo(() => ({ groupId, weekStart, revision: reviewRevision, actorId: currentUser.id, reload }), [groupId, weekStart, reviewRevision, currentUser.id, reload]);
  const [response, setResponse] = useState<{ request: object; preview: SchedulePublicationPreview } | null>(null);
  const [failure, setFailure] = useState<{ request: object; message: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const preview = response?.request === request ? response.preview : null;
  const error = failure?.request === request ? failure.message : "";
  const loading = !preview && !error;
  const stale = Boolean(preview && preview.versions.scheduleRevision !== revision);
  useUnsavedChangesWarning(publishing);
  useEffect(() => {
    let current = true;
    void previewManagedSchedulePublication({ actorId: request.actorId, expectedRevision: request.revision, groupId: request.groupId, weekStart: request.weekStart }).then((next) => {
      if (current) { setResponse({ request, preview: next }); setPage(1); }
    }).catch((reason) => {
      console.error("Не удалось загрузить предпросмотр публикации:", reason);
      if (current) setFailure({ request, message: reason instanceof Error ? reason.message : "Не удалось сравнить расписание." });
    });
    return () => { current = false; };
  }, [request]);
  const publish = async () => {
    if (!preview || publishing || error || stale) return;
    setPublishing(true);
    try {
      const next = await publishManagedScheduleDraft({ actorId: currentUser.id, expectedRevision: preview.versions.scheduleRevision, weekStart, groupId, reviewedVersions: preview.versions });
      onPublished(next);
    } catch (reason) { console.error("Не удалось опубликовать проверенную неделю:", reason); setFailure({ request, message: reason instanceof Error ? reason.message : "Не удалось опубликовать неделю." }); }
    finally { setPublishing(false); }
  };
  const rows = preview?.rows.filter((row) => filter === "all" || row.kind === filter) ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  return <Modal labelledBy={titleId} initialFocusRef={closeRef} onClose={() => { if (!publishing) onClose(); }} className={base.dialog}>
    <header className={base.header}><div><h2 id={titleId}>Проверьте изменения расписания</h2><p>{groupName} · неделя с {dateLabel(weekStart)}</p></div><button ref={closeRef} type="button" disabled={publishing} onClick={onClose}>Вернуться</button></header>
    {loading && <p className={base.note} role="status">Сравниваем сохранённый черновик с публикацией…</p>}
    {error && <p className={base.error} role="alert">{error}</p>}
    {stale && <p className={base.error} role="alert">Расписание изменилось после проверки. Обновите предпросмотр и проверьте актуальные изменения.</p>}
    <div className={styles.tools}><button type="button" disabled={publishing} onClick={() => { setReviewRevision(revision); setReload((value) => value + 1); }}>Обновить предпросмотр</button></div>
    {preview && <>
      <div className={styles.summary} role="status"><div><span>Добавится</span><strong>{preview.counts.added}</strong></div><div><span>Изменится</span><strong>{preview.counts.changed}</strong></div><div><span>Будет убрано</span><strong>{preview.counts.removed}</strong></div><div><span>Без изменений</span><strong>{preview.counts.unchanged}</strong></div></div>
      <p className={base.note}>Было в сохранённой публикации: {preview.beforeCount} · Будет: {preview.afterCount}.</p>
      {!preview.wasPublished && <p className={base.warning}>Это первая сохранённая публикация недели. Расписание этой группы заменит демонстрационные занятия, если они показывались ранее.</p>}
      {preview.afterCount === 0 && <p className={base.warning}>После публикации у группы не будет занятий в этой неделе.{preview.beforeCount > 0 ? ` Будет отменено опубликованных пар: ${preview.beforeCount}. Их отметки сохранятся в истории журнала.` : ""}</p>}
      {preview.rows.length > 0 && <Dropdown label="Показать изменения" value={filter} options={[{ value: "all", label: "Все изменения" }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} disabled={publishing} onChange={(value) => { setFilter(value); setPage(1); }} />}
      <section className={styles.changes} aria-label="Изменения перед публикацией">{rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((row) => {
        const lesson = row.after ?? row.before!;
        const fields = row.fields.filter((field) => field !== "teacherName" || !row.fields.includes("teacherId"));
        return <article key={row.id} className={styles.card}><div className={styles.heading}><span className={styles[row.kind]}>{labels[row.kind]}</span><h3>{getAcademicSubjectDefinition(lesson.subjectId)?.name ?? "Дисциплина недоступна"}</h3></div><div className={styles.sides}>{row.before && <LessonSummary label="Было" lesson={row.before} />}{row.after && <LessonSummary label="Будет" lesson={row.after} />}</div>{row.before && row.after && <dl className={styles.fields}>{fields.map((field) => <div key={field}><dt>{PUBLICATION_FIELD_LABELS[field]}</dt><dd><span>{fieldValue(row.before!, field)}</span><span aria-hidden="true">→</span><strong>{fieldValue(row.after!, field)}</strong></dd></div>)}</dl>}</article>;
      })}</section>
      {!rows.length && <p className={base.empty}>{preview.rows.length ? "Изменений выбранного типа нет." : preview.wasPublished ? "Список занятий совпадает с сохранённой публикацией. Повторная публикация обновит дату и автора публикации." : "Черновик пуст. Первая публикация создаст неделю без занятий."}</p>}
      {pages > 1 && <nav className={base.pagination} aria-label="Страницы изменений расписания"><button type="button" disabled={publishing || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pages}</span><button type="button" disabled={publishing || currentPage === pages} onClick={() => setPage(currentPage + 1)}>Далее</button></nav>}
    </>}
    <footer className={base.footer}><p>Удалённые опубликованные пары останутся в журнале отменёнными, с сохранением прежних отметок. Проверки доступа, назначений и конфликтов повторятся при публикации.</p><button type="button" className={base.primary} disabled={publishing || loading || Boolean(error) || !preview || stale} onClick={() => void publish()}>{publishing ? "Публикуем…" : "Опубликовать неделю"}</button></footer>
  </Modal>;
}
