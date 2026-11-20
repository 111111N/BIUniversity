import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import { useRole } from "../../components/RoleContext";
import { listManagedSchedulePublications, previewManagedScheduleRestoration, verifyManagedScheduleRestoration, subscribeManagedSchedule, type ScheduleRestorationPreview } from "../../data/managedScheduleStore";
import { subscribeAccounts } from "../../data/accountStore";
import { subscribeSubjectCatalog } from "../../data/subjectCatalogStore";
import { subscribeGroupCalendars } from "../../data/groupCalendarRead";
import { subscribeTeachingAssignments } from "../../data/teachingAssignmentsRead";
import { sameManagedScheduleVersions } from "../../domain/scheduleVersions";
import { PUBLICATION_FIELD_LABELS, type PublicationChangeKind } from "../../domain/schedulePublication";
import { lessonTypeLabels } from "../../domain/academic";
import type { ManagedLesson } from "../../domain/scheduleManagement";
import { getAcademicSubjectDefinition } from "../../data/academicCatalog";
import { formatAcademicDay } from "../../domain/academicCalendarMath";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import SaveTemplate from "./SaveTemplate";
import base from "./CopyWeekDialog.module.scss";
import styles from "./PublicationReview.module.scss";

type ArchivePage = Awaited<ReturnType<typeof listManagedSchedulePublications>>;
const labels: Record<PublicationChangeKind, string> = { added: "Добавится", changed: "Изменится", removed: "Будет убрано" };
function Lesson({ label, value }: { label: string; value: ManagedLesson }) {
  return <div><h4>{label}</h4><p>{formatAcademicDay(value.date)} · {value.startsAt}–{value.endsAt}</p><p>{getAcademicSubjectDefinition(value.subjectId)?.name ?? "Дисциплина недоступна"} · {lessonTypeLabels[value.type]}</p><p>{value.teacherName} · ауд. {value.room}</p></div>;
}
interface Props { groupId: string; groupName: string; weekStart: string; onClose(): void; onApply(lessons: ManagedLesson[]): void }
export default function PublicationArchive({ groupId, groupName, weekStart, onClose, onApply }: Props) {
  const { currentUser } = useRole(), titleId = useId(), closeRef = useRef<HTMLButtonElement>(null), pending = useRef(false);
  const generation = useRef(0), identity = JSON.stringify([currentUser.id, groupId, weekStart]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const [page, setPage] = useState(1), [changesPage, setChangesPage] = useState(1), [reload, setReload] = useState(0), [selectedId, setSelectedId] = useState(""), [working, setBusy] = useState(false), [savingTemplate, setSavingTemplate] = useState(false), [error, setError] = useState("");
  const busy = working || savingTemplate, { requestAction } = useUnsavedChangesGuard();
  const [response, setResponse] = useState<{ request: object; data?: ArchivePage; error: string } | null>(null), [comparison, setComparison] = useState<{ key: string; data: ScheduleRestorationPreview } | null>(null);
  const request = useMemo(() => ({ actorId: currentUser.id, groupId, weekStart, page, reload }), [currentUser.id, groupId, weekStart, page, reload]);
  const scope = JSON.stringify([currentUser.id, groupId, weekStart, selectedId]);
  const archive = response?.request === request ? response.data : undefined, listError = response?.request === request ? response.error : "";
  const preview = comparison?.key === scope ? comparison.data : null;
  const stale = Boolean(preview && (!archive || !sameManagedScheduleVersions(preview.versions, archive.versions)));
  const pages = Math.max(1, Math.ceil((preview?.rows.length ?? 0) / 20)), currentPage = Math.min(changesPage, pages);
  useUnsavedChangesWarning(busy);
  useEffect(() => { invalidate(); pending.current = false; setBusy(false); setError(""); setSelectedId(""); setComparison(null); return invalidate; }, [identity, invalidate]);
  useEffect(() => {
    const refresh = () => setReload(value => value + 1), stops = [subscribeManagedSchedule(refresh), subscribeAccounts(refresh), subscribeSubjectCatalog(refresh), subscribeGroupCalendars(refresh), subscribeTeachingAssignments(refresh)];
    return () => stops.forEach(stop => stop());
  }, []);
  useEffect(() => {
    let current = true;
    void listManagedSchedulePublications(request).then(data => { if (current) setResponse({ request, data, error: "" }); })
      .catch(failure => { console.error("Не удалось загрузить список публикаций:", failure); if (current) setResponse({ request, error: failure instanceof Error ? failure.message : "Архив недоступен." }); });
    return () => { current = false; };
  }, [request]);
  const compare = async (id: string) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setSelectedId(id); setChangesPage(1);
    const token = ++generation.current;
    const key = JSON.stringify([currentUser.id, groupId, weekStart, id]);
    try { const data = await previewManagedScheduleRestoration({ actorId: currentUser.id, groupId, weekStart, publicationId: id }); if (generation.current === token) setComparison({ key, data }); }
    catch (failure) { console.error("Не удалось сравнить выбранную публикацию:", failure); if (generation.current === token) { setComparison(null); setError(failure instanceof Error ? failure.message : "Сравнение недоступно."); } }
    finally { if (generation.current === token) { pending.current = false; setBusy(false); } }
  };
  const restore = async () => {
    if (!preview || stale || !preview.canRestore || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    const token = ++generation.current;
    try { const lessons = await verifyManagedScheduleRestoration({ actorId: currentUser.id, groupId, weekStart, publicationId: preview.publicationId, versions: preview.versions }); if (generation.current === token) onApply(lessons); }
    catch (failure) { console.error("Не удалось перенести публикацию в рабочую неделю:", failure); if (generation.current === token) setError(failure instanceof Error ? failure.message : "Восстановление недоступно. Повторите сравнение."); }
    finally { if (generation.current === token) { pending.current = false; setBusy(false); } }
  };
  const close = () => { if (!busy) requestAction(onClose); };
  return <Modal onClose={close} labelledBy={titleId} initialFocusRef={closeRef} className={base.dialog}>
    <header className={base.header}><div><h2 id={titleId}>Архив публикаций</h2><p>{groupName} · неделя с {formatAcademicDay(weekStart)}</p></div><button ref={closeRef} type="button" disabled={busy} onClick={close}>Закрыть</button></header>
      {(!archive && !listError) && <p role="status">Загружаем версии…</p>}
      {(listError || error) && <p className={base.error} role="alert">{listError || error}</p>}
      {listError && <button type="button" disabled={busy} onClick={() => setReload(value => value + 1)}>Повторить чтение</button>}
      {archive && !archive.total && <p>{archive.legacy ? "Ранних версий в архиве нет. При следующей публикации сохранится снимок нынешнего расписания, затем будут записываться новые публикации. Отсутствующая история не создаётся." : "Для этой недели ещё нет архивных публикаций."}</p>}
      <div className={styles.changes}>{archive?.items.map(row => <button className={styles.version} type="button" key={row.id} aria-pressed={selectedId === row.id} disabled={busy} onClick={() => { if (row.id === selectedId) void compare(row.id); else requestAction(() => void compare(row.id)); }}><strong>Версия {row.number} · занятий: {row.lessons}</strong><span>{row.origin === "saved-snapshot" ? "Снимок до включения архива" : "Публикация"} · {new Date(row.occurredAt).toLocaleString("ru-RU")}</span><span>{row.origin === "saved-snapshot" ? "Снимок сохранил" : "Опубликовал"}: {row.actorName}</span><span>Сравнить с рабочей неделей</span></button>)}</div>
      {archive && archive.pages > 1 && <nav className={base.pagination} aria-label="Страницы версий расписания"><button type="button" disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>Назад</button><span>{page} / {archive.pages}</span><button type="button" disabled={busy || page >= archive.pages} onClick={() => setPage(page + 1)}>Далее</button></nav>}
      {preview && <><h3>Если восстановить версию {preview.number}</h3><p>Добавится: {preview.counts.added} · изменится: {preview.counts.changed} · уберётся: {preview.counts.removed} · без изменений: {preview.counts.unchanged}</p>
        {stale && <p className={base.error} role="alert">Источники изменились. Повторите сравнение выбранной версии.</p>}
        {!preview.canRestore && <p className={base.error} role="status">{preview.issues[0] ?? "Восстановление этой версии недоступно."}</p>}
        {preview.issues.length > 0 && <details><summary>Перед сохранением и публикацией нужно проверить: {preview.issues.length}</summary><ul>{preview.issues.slice(0, 20).map(issue => <li key={issue}>{issue}</li>)}</ul>{preview.issues.length > 20 && <p>Показаны первые 20 замечаний. Остальные проверки повторятся при сохранении и публикации.</p>}</details>}
        {!preview.rows.length && <p>Выбранная версия совпадает с рабочей неделей.</p>}
        <div className={styles.changes}>{preview.rows.slice((currentPage - 1) * 20, currentPage * 20).map(row => <article className={styles.card} key={row.id}><h4>{labels[row.kind]}</h4>{row.fields.length > 0 && <p>{row.fields.map(field => PUBLICATION_FIELD_LABELS[field]).join(", ")}</p>}<div className={styles.sides}>{row.before && <Lesson label="Рабочая неделя" value={row.before} />}{row.after && <Lesson label="Выбранная версия" value={row.after} />}</div></article>)}</div>
        {pages > 1 && <nav className={base.pagination} aria-label="Страницы сравнения расписания"><button type="button" disabled={currentPage <= 1 || busy} onClick={() => setChangesPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages || busy} onClick={() => setChangesPage(currentPage + 1)}>Далее</button></nav>}
        <SaveTemplate key={`${currentUser.id}:${preview.publicationId}`} publicationId={preview.publicationId} onBusyChange={setSavingTemplate} />
        <footer className={base.footer}><p>Версия заменит рабочий список. Затем исправьте замечания, сохраните черновик и опубликуйте отдельно. Перенос не меняет текущую публикацию и отметки.</p><button className={base.primary} type="button" disabled={busy || stale || !preview.canRestore || !preview.rows.length} onClick={() => requestAction(() => void restore())}>Перенести в рабочую неделю</button></footer>
      </>}
  </Modal>;
}
