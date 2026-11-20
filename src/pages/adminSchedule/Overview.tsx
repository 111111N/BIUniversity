import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Link from "../../components/ChecksContextLink";
import AdministrationReturnNotice from "../../components/AdministrationReturnNotice";
import Card from "../../components/Card";
import Dropdown from "../../components/Dropdown";
import TemporalField from "../../components/DateTimePicker/Field";
import SearchField from "../../components/SearchField";
import { useRole } from "../../components/RoleContext";
import { scheduleOverviewService } from "../../data/scheduleOverview";
import { getManagedWeekKey } from "../../domain/scheduleManagement";
import { getWeekStart, toLocalDateKey } from "../../domain/schedule";
import { formatAcademicDay } from "../../domain/academicCalendarMath";
import { formatLessonRoom } from "../../domain/rooms";
import { lessonTypeLabels } from "../../domain/academic";
import styles from "../adminPrograms/index.module.scss";

type Result = Awaited<ReturnType<typeof scheduleOverviewService.query>>;
function Overview({ actorId }: { actorId: string }) {
  const [params, setParams] = useSearchParams(), [openingWeek] = useState(() => { const start = getWeekStart(new Date()), end = new Date(start); end.setDate(end.getDate() + 6); return { from: toLocalDateKey(start), to: toLocalDateKey(end) }; });
  const q = params.get("q") ?? "", teacher = params.get("teacher") ?? "all", group = params.get("group") ?? "all", room = params.get("room") ?? "all", from = params.get("from") ?? openingWeek.from, to = params.get("to") ?? openingWeek.to, page = Number(params.get("page") ?? "1");
  const [reload, setReload] = useState(0), [response, setResponse] = useState<{ request: object; data?: Result; error: string } | null>(null);
  const request = useMemo(() => ({ actorId, q, teacher, group, room, from, to, page, reload }), [actorId, q, teacher, group, room, from, to, page, reload]);
  useEffect(() => scheduleOverviewService.subscribe(() => setReload(value => value + 1)), []);
  useEffect(() => {
    let current = true;
    void scheduleOverviewService.query(actorId, request).then(data => { if (current) setResponse({ request, data, error: "" }); })
      .catch(error => { console.error("Не удалось обновить обзор расписания:", error); if (current) setResponse({ request, error: error instanceof Error ? error.message : "Расписание недоступно." }); });
    return () => { current = false; };
  }, [actorId, request]);
  const source = response?.request === request ? response : null, data = source?.data;
  const change = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); if (value === "all" || key === "q" && !value) next.delete(key); else next.set(key, value); if (key !== "page") next.delete("page"); return next; }, { replace: true });
  const reset = () => setParams(previous => { const next = new URLSearchParams(previous); ["q", "teacher", "group", "room", "page"].forEach(key => next.delete(key)); next.set("from", openingWeek.from); next.set("to", openingWeek.to); return next; }, { replace: true });
  return <div className={`pageContainer ${styles.page}`}><AdministrationReturnNotice /><nav className={styles.actions} aria-label="Работа с расписанием"><Link to="/admin/schedule">Редактор недель</Link><Link to="/admin/calendars">Учебные календари</Link></nav>
    <Card className={styles.toolbar}><h1>Опубликованное расписание</h1><SearchField label="Поиск дисциплины, преподавателя или аудитории" value={q} placeholder="" onChange={value => change("q", value.slice(0, 256))} /><div className={styles.hourGrid}>
      <Dropdown searchable label="Преподаватель" value={teacher} options={[{ value: "all", label: "Все преподаватели" }, ...(data?.teachers ?? [])]} onChange={value => change("teacher", value)} />
      <Dropdown searchable label="Аудитория" value={room} options={[{ value: "all", label: "Все аудитории" }, ...(data?.rooms ?? [])]} onChange={value => change("room", value)} />
      <Dropdown searchable label="Группа" value={group} options={[{ value: "all", label: "Все группы" }, ...(data?.groupOptions ?? [])]} onChange={value => change("group", value)} />
      <TemporalField label="Дата начала" value={from} onChange={value => change("from", value)} /><TemporalField label="Дата окончания" value={to} onChange={value => change("to", value)} />
    </div><div className={styles.actions}><button type="button" onClick={reset}>Сбросить фильтры</button><button type="button" onClick={() => setReload(value => value + 1)}>Обновить</button></div></Card>
    {!source && <p role="status">Загружаем опубликованное расписание…</p>}
    {(source?.error || data?.queryError) && <p className={styles.error} role="alert">{source?.error || data?.queryError}</p>}
    {data?.warning && <p role="status">{data.warning}</p>}
    {data && !data.queryError && <Card className={styles.list}><div className={styles.actions}><h2>{formatAcademicDay(from)} — {formatAcademicDay(to)}</h2><span>Занятий: {data.total} · групп: {data.groups}</span></div>
      {!data.rows.length && <p>В выбранном периоде нет подходящих сохранённых публикаций.</p>}
      {data.rows.map(lesson => <article className={styles.row} key={lesson.id}><div><strong>{lesson.subjectName} · {lessonTypeLabels[lesson.type]}</strong><p>{formatAcademicDay(lesson.date)} · {lesson.startsAt}–{lesson.endsAt} · {lesson.groupName}</p><p>{lesson.teacherName} · ауд. {formatLessonRoom(lesson)}</p></div><Link to={`/admin/schedule?group=${encodeURIComponent(lesson.groupId)}&date=${getManagedWeekKey(lesson.date)}`}>Открыть неделю</Link></article>)}
      {data.pages > 1 && <nav className={styles.actions} aria-label="Страницы опубликованного расписания"><button type="button" disabled={data.page <= 1} onClick={() => change("page", String(data.page - 1))}>Назад</button><span>{data.page} / {data.pages}</span><button type="button" disabled={data.page >= data.pages} onClick={() => change("page", String(data.page + 1))}>Далее</button></nav>}
    </Card>}
  </div>;
}
export default function ScheduleOverviewPage() { const { currentUser } = useRole(); return <Overview key={currentUser.id} actorId={currentUser.id} />; }
