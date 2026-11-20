import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRole } from "../../components/RoleContext";
import Modal from "../../components/Modal";
import Dropdown from "../../components/Dropdown";
import useScheduleTemplates from "../../hooks/useScheduleTemplates";
import { previewManagedScheduleCopy, verifyManagedScheduleCopy, type ScheduleCopyPreview } from "../../data/managedScheduleStore";
import { ACADEMIC_GROUPS, getAcademicGroup, getAcademicSubjectDefinition } from "../../data/academicCatalog";
import { subscribeAccounts } from "../../data/accountStore";
import { subscribeSubjectCatalog } from "../../data/subjectCatalogStore";
import { subscribeGroupCalendars } from "../../data/groupCalendarRead";
import { subscribeTeachingAssignments } from "../../data/teachingAssignmentsRead";
import { subscribeRooms } from "../../data/roomsRead";
import { formatLessonRoom } from "../../domain/rooms";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
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
  const templates = useScheduleTemplates(currentUser.id), [kind, setKind] = useState("week"), [templateId, setTemplateId] = useState("");
  const selectedTemplate = templates.snapshot?.templates.find(row => row.id === templateId && row.status === "active");
  const [sourceGroupId, setSourceGroupId] = useState(groupId), [epoch, setEpoch] = useState(0), [previewEpoch, setPreviewEpoch] = useState(-1);
  const generation = useRef(0), pending = useRef(false), identity = JSON.stringify([currentUser.id, groupId, targetWeekStart]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const availableGroupIds = useMemo(() => new Set([...snapshot.drafts, ...snapshot.published].filter(week => week.lessons.length).map(week => week.groupId)), [snapshot]);
  const sources = useMemo(() => (["published", "draft"] as const).flatMap((source) =>
    (source === "draft" ? snapshot.drafts : snapshot.published).filter((week) => week.groupId === sourceGroupId && (week.weekStart !== targetWeekStart || sourceGroupId !== groupId) && week.lessons.length).map((week) => ({ source, weekStart: week.weekStart, count: week.lessons.length, key: `${source}:${week.weekStart}` })),
  ).sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.source.localeCompare(b.source)), [snapshot, groupId, sourceGroupId, targetWeekStart]);
  const [sourceKey, setSourceKey] = useState("");
  const [storedPreview, setPreview] = useState<ScheduleCopyPreview | null>(null), [previewIdentity, setPreviewIdentity] = useState("");
  const preview = previewIdentity === identity ? storedPreview : null;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const source = sources.find((entry) => entry.key === sourceKey);
  const stale = Boolean(preview && (preview.scheduleRevision !== snapshot.revision || previewEpoch !== epoch || kind === "template" && (templates.loading || templates.error || templates.snapshot?.context.expectedRevision !== preview.templatesRevision || selectedTemplate?.revision !== preview.templateRevision)));
  const sorted = useMemo(() => preview ? [...preview.lessons].sort((a, b) => a.date.localeCompare(b.date) || a.startsAt.localeCompare(b.startsAt)) : [], [preview]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useUnsavedChangesWarning(busy);
  useEffect(() => { invalidate(); pending.current = false; setBusy(false); setSourceGroupId(groupId); setSourceKey(""); setKind("week"); setTemplateId(""); setPreview(null); setError(""); return invalidate; }, [identity, groupId, invalidate]);
  useEffect(() => {
    const changed = () => setEpoch(value => value + 1), stops = [subscribeAccounts(changed), subscribeSubjectCatalog(changed), subscribeGroupCalendars(changed), subscribeTeachingAssignments(changed), subscribeRooms(changed)];
    return () => stops.forEach(stop => stop());
  }, []);
  const prepare = async () => {
    if (pending.current || kind === "week" && !source || kind === "template" && (!selectedTemplate?.source || templates.loading || templates.error)) return;
    const token = ++generation.current; pending.current = true;
    setBusy(true); setError(""); setPreview(null); setPage(1);
    try {
      const request: ScheduleCopyRequest = kind === "template" ? { source: "publication", publicationId: selectedTemplate!.publicationId, templateId: selectedTemplate!.id, sourceWeekStart: selectedTemplate!.source!.weekStart, sourceGroupId: selectedTemplate!.source!.groupId, targetWeekStart, groupId }
        : { source: source!.source, sourceWeekStart: source!.weekStart, targetWeekStart, groupId, sourceGroupId };
      const next = await previewManagedScheduleCopy({ actorId: currentUser.id, request });
      if (generation.current === token) { setPreview(next); setPreviewEpoch(epoch); setPreviewIdentity(identity); }
    } catch (reason) { console.error("Не удалось проверить копирование недели в форме:", reason); if (generation.current === token) setError(reason instanceof Error ? reason.message : "Не удалось подготовить копию."); }
    finally { if (generation.current === token) { pending.current = false; setBusy(false); } }
  };
  const apply = async () => {
    if (!preview || pending.current || stale || !preview.canApply) return;
    const token = ++generation.current; pending.current = true;
    setBusy(true); setError("");
    try {
      await verifyManagedScheduleCopy({ actorId: currentUser.id, versions: preview, request: preview.request, templateRevision: preview.templateRevision, templatesRevision: preview.templatesRevision });
      if (generation.current === token) onApply(structuredClone(preview.lessons));
    } catch (reason) { console.error("Не удалось перенести копию в рабочую неделю:", reason); if (generation.current === token) setError(reason instanceof Error ? reason.message : "Не удалось применить копию. Повторите проверку."); }
    finally { if (generation.current === token) { pending.current = false; setBusy(false); } }
  };
  return <Modal labelledBy={titleId} initialFocusRef={closeRef} onClose={() => { if (!busy) onClose(); }} className={styles.dialog}>
    <header className={styles.header}><div><h2 id={titleId}>Копировать неделю</h2><p>{groupName} · в неделю {weekLabel(targetWeekStart)}</p></div><button ref={closeRef} type="button" disabled={busy} onClick={onClose}>Закрыть</button></header>
    <Dropdown label="Источник расписания" disabled={busy} value={kind} options={[{ value: "week", label: "Из недели" }, { value: "template", label: "Из шаблона" }]} onChange={value => { if (pending.current) return; invalidate(); setKind(value); setPreview(null); setError(""); }} />
    <p className={styles.note}>Дни недели, время, преподаватели и аудитории сохранятся; назначения и пересечения проверяются для группы назначения.</p>
    {kind === "week" ? <><Dropdown searchable label="Исходная группа" value={sourceGroupId} options={ACADEMIC_GROUPS.filter(group => group.id === groupId || availableGroupIds.has(group.id)).map(group => ({ value: group.id, label: `${group.name}${group.status === "archived" ? " (архив)" : ""}` }))} disabled={busy} onChange={id => { setSourceGroupId(id); setSourceKey(""); setPreview(null); setError(""); }} />
    {sources.length ? <div className={styles.source}><Dropdown searchable label="Неделя для копирования" placeholder="" value={sourceKey} options={sources.map((entry) => ({ value: entry.key, label: `${weekLabel(entry.weekStart)} · ${entry.source === "draft" ? "Черновик" : "Опубликовано"} · Занятий: ${entry.count}` }))} disabled={busy} onChange={(key) => { setSourceKey(key); setPreview(null); setError(""); }} /><button type="button" disabled={busy || !source} onClick={() => void prepare()}>{busy ? "Проверяем…" : preview ? "Повторить проверку" : "Проверить копирование"}</button></div> : <p className={styles.empty}>В выбранной группе нет подходящей сохранённой недели. Выберите другую исходную группу или сначала сохраните исходную неделю.</p>}</> : <>
      {templates.loading && <p role="status">Загружаем шаблоны…</p>}{templates.error && <div className={styles.warning}><p role="alert">{templates.error}</p><button type="button" disabled={busy} onClick={templates.refresh}>Повторить чтение шаблонов</button></div>}
      <div className={styles.source}><Dropdown searchable label="Шаблон" value={templateId} disabled={busy || templates.loading || Boolean(templates.error)} options={(templates.snapshot?.templates ?? []).filter(row => row.status === "active").map(row => ({ value: row.id, label: `${row.name}${row.source ? ` · ${getAcademicGroup(row.source.groupId)?.name ?? "Группа недоступна"} · ${weekLabel(row.source.weekStart)}` : " · исходная версия недоступна"}` }))} onChange={id => { setTemplateId(id); setPreview(null); setError(""); }} /><button type="button" disabled={busy || templates.loading || Boolean(templates.error) || !selectedTemplate?.source} onClick={() => void prepare()}>Проверить шаблон</button></div>
      {!templates.loading && !templates.error && !templates.snapshot?.templates.some(row => row.status === "active") && <p className={styles.empty}>Действующих шаблонов пока нет. Сохраните выбранную версию как шаблон в архиве публикаций.</p>}
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {preview && <section className={styles.preview} aria-label="Предпросмотр копии недели">
      <div className={styles.summary} role="status"><strong>Будет скопировано: {preview.lessons.length}</strong><span>Конфликтов: {preview.conflicts.length}</span></div>
      {(currentLessonCount > 0 || hasUnsavedChanges) && <p className={styles.warning}>В рабочей неделе сейчас занятий: {currentLessonCount}.{hasUnsavedChanges ? " Есть несохранённые изменения." : ""} Применение копии заменит этот список целиком. Опубликованное расписание пока сохранится.</p>}
      {preview.issues.length > 0 && <div className={styles.warning}><strong>Проверки перед сохранением и публикацией</strong><ul>{preview.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><p>{preview.canApply ? "Можно перенести копию в рабочую неделю и исправить занятия там." : "Перенос недоступен до переоткрытия затронутого периода."}</p></div>}
      {preview.conflicts.length > 0 && <details className={styles.warning} open><summary>Конфликты на новой неделе</summary><ul>{preview.conflicts.map((conflict, index) => <li key={index}>{conflict.message}</li>)}</ul><p>Сохранить черновик с конфликтами можно; публикация потребует их устранения.</p></details>}
      <ul className={styles.lessons}>{sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((lesson) => <li key={lesson.id}><div><strong>{dateLabel(lesson.date)}</strong><span>{lesson.startsAt}–{lesson.endsAt}</span></div><div><strong>{getAcademicSubjectDefinition(lesson.subjectId)?.name ?? "Дисциплина недоступна"}</strong><span>{lessonTypeLabels[lesson.type]} · {lesson.teacherName} · Ауд. {formatLessonRoom(lesson)}</span></div></li>)}</ul>
      {pageCount > 1 && <nav className={styles.pagination} aria-label="Страницы предпросмотра копии"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</button><span>{page} / {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setPage(page + 1)}>Далее</button></nav>}
      <p className={styles.note}>Проверьте чётность недели. При публикации будут проверены заданные каникулы и неучебные дни; закрытый период нельзя изменять до переоткрытия.</p>
      {stale && <p className={styles.error} role="alert">Расписание, назначения или справочники изменились. Повторите проверку перед применением копии.</p>}
      <footer className={styles.footer}><p>После переноса сохраните черновик. Публикация выполняется отдельно.</p><button type="button" className={styles.primary} disabled={busy || stale || !preview.canApply} onClick={() => void apply()}>{busy ? "Проверяем…" : currentLessonCount > 0 || hasUnsavedChanges ? "Заменить рабочую неделю" : "Перенести в рабочую неделю"}</button></footer>
    </section>}
  </Modal>;
}
