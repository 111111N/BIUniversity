import { useMemo, useState } from "react";
import Dropdown from "../../components/Dropdown";
import { academicCalendarWeeks, academicDayKey, academicDayNumber, formatAcademicDay } from "../../domain/academicCalendarMath";
import { CALENDAR_PHASES, type CalendarContents as Contents, type GroupCalendar } from "../../domain/groupCalendarTypes";
import styles from "./index.module.scss";

function Pages({ page, pages, onChange, label }: { page: number; pages: number; onChange(page: number): void; label: string }) {
  return pages > 1 ? <nav className={styles.actions} aria-label={label}><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Назад</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Далее</button></nav> : null;
}
export function CalendarOverview({ contents, period }: { contents: Contents; period: GroupCalendar["period"] }) {
  const [page, setPage] = useState(1), [open, setOpen] = useState(false);
  const weeks = useMemo(() => {
    const phases = new Map<string, string>();
    for (const segment of contents.segments) for (let day = academicDayNumber(segment.startsOn); day <= academicDayNumber(segment.endsOn); day++) phases.set(academicDayKey(day), segment.kind);
    for (const day of contents.daysOff) phases.set(day.date, "dayOff");
    return academicCalendarWeeks(period.term).map(week => {
      const counts = new Map<string, number>(); let teaching = false;
      for (let day = academicDayNumber(week.startsOn); day <= academicDayNumber(week.endsOn); day++) {
        const phase = phases.get(academicDayKey(day)); teaching ||= phase === "teaching";
        const label = phase === "dayOff" ? "Неучебные дни" : phase ? CALENDAR_PHASES[phase as keyof typeof CALENDAR_PHASES] : "Не размечено";
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return { ...week, teaching, label: [...counts].map(([label, count]) => `${label}: ${count} дн.`).join(" · ") };
    });
  }, [contents, period]);
  const pages = Math.max(1, Math.ceil(weeks.length / 20)), current = Math.min(page, pages), teachingWeeks = weeks.filter(week => week.teaching).length;
  return <div className={styles.list}><p className={styles.note}>Недель с обучением: {teachingWeeks} · Интервалов: {contents.segments.length} · Неучебных дат: {contents.daysOff.length}</p>
    <details onToggle={event => setOpen(event.currentTarget.open)}><summary>Календарь по неделям</summary>{open && <><div className={styles.list}>{weeks.slice((current - 1) * 20, current * 20).map(week => <div key={week.weekStart} className={styles.row}><strong>{formatAcademicDay(week.startsOn)} — {formatAcademicDay(week.endsOn)}</strong><span>{week.label}</span></div>)}</div><Pages page={current} pages={pages} onChange={setPage} label="Учебные недели" /></>}</details>
    <details><summary>Интервалы и неучебные дни</summary><CalendarContentsList contents={contents} /></details>
  </div>;
}
export function CalendarContentsList({ contents }: { contents: Contents }) {
  const [page, setPage] = useState(1), rows = [...contents.segments.map(row => ({ id: row.id, text: `${CALENDAR_PHASES[row.kind]} · ${formatAcademicDay(row.startsOn)} — ${formatAcademicDay(row.endsOn)}` })), ...contents.daysOff.map(row => ({ id: row.id, text: `${formatAcademicDay(row.date)} · ${row.name}` }))];
  const pages = Math.max(1, Math.ceil(rows.length / 20)), current = Math.min(page, pages);
  return <><ul className={styles.history}>{rows.slice((current - 1) * 20, current * 20).map(row => <li key={row.id}>{row.text}</li>)}</ul>{!rows.length && <p className={styles.note}>Календарь пока не размечен.</p>}<Pages page={current} pages={pages} onChange={setPage} label="Состав календаря" /></>;
}
export default function CalendarContentsEditor({ contents, period, disabled, onChange }: { contents: Contents; period: GroupCalendar["period"]; disabled: boolean; onChange(contents: Contents): void }) {
  const [segmentPage, setSegmentPage] = useState(1), [dayPage, setDayPage] = useState(1), [error, setError] = useState("");
  const segmentPages = Math.max(1, Math.ceil(contents.segments.length / 20)), currentSegment = Math.min(segmentPage, segmentPages), dayPages = Math.max(1, Math.ceil(contents.daysOff.length / 20)), currentDay = Math.min(dayPage, dayPages);
  const add = (kind: "segment" | "day") => {
    if (disabled) return;
    try {
      const id = crypto.randomUUID(); setError("");
      if (kind === "segment" && contents.segments.length < 500) { onChange({ ...contents, segments: [...contents.segments, { id, kind: "teaching", startsOn: period.term.startsOn, endsOn: period.term.startsOn }] }); setSegmentPage(Math.ceil((contents.segments.length + 1) / 20)); }
      if (kind === "day" && contents.daysOff.length < 1000) { onChange({ ...contents, daysOff: [...contents.daysOff, { id, date: period.term.startsOn, name: "" }] }); setDayPage(Math.ceil((contents.daysOff.length + 1) / 20)); }
    } catch (failure) { console.error("Не удалось добавить строку учебного календаря:", failure); setError("Не удалось подготовить строку календаря."); }
  };
  return <div className={styles.list}>{error && <p role="alert">{error}</p>}<div className={styles.actions}><h3>Интервалы семестра</h3><button type="button" disabled={disabled || contents.segments.length >= 500} onClick={() => add("segment")}>Добавить интервал</button></div>
    {contents.segments.slice((currentSegment - 1) * 20, currentSegment * 20).map(segment => <div className={styles.calendarRow} key={segment.id}>
      <Dropdown label="Вид периода" value={segment.kind} options={Object.entries(CALENDAR_PHASES).map(([value, label]) => ({ value, label }))} disabled={disabled} onChange={kind => onChange({ ...contents, segments: contents.segments.map(row => row.id === segment.id ? { ...row, kind: kind as typeof segment.kind } : row) })} />
      <label className={styles.field}>Начало<input type="date" required min={period.term.startsOn} max={period.term.endsOn} value={segment.startsOn} disabled={disabled} onChange={event => onChange({ ...contents, segments: contents.segments.map(row => row.id === segment.id ? { ...row, startsOn: event.target.value } : row) })} /></label>
      <label className={styles.field}>Окончание<input type="date" required min={period.term.startsOn} max={period.term.endsOn} value={segment.endsOn} disabled={disabled} onChange={event => onChange({ ...contents, segments: contents.segments.map(row => row.id === segment.id ? { ...row, endsOn: event.target.value } : row) })} /></label>
      <button type="button" disabled={disabled} aria-label={`Удалить интервал ${segment.startsOn}`} onClick={() => onChange({ ...contents, segments: contents.segments.filter(row => row.id !== segment.id) })}>Удалить</button>
    </div>)}<Pages page={currentSegment} pages={segmentPages} onChange={setSegmentPage} label="Интервалы семестра" />
    <div className={styles.actions}><h3>Неучебные дни</h3><button type="button" disabled={disabled || contents.daysOff.length >= 1000} onClick={() => add("day")}>Добавить дату</button></div>
    {contents.daysOff.slice((currentDay - 1) * 20, currentDay * 20).map(day => <div className={styles.calendarDay} key={day.id}>
      <label className={styles.field}>Дата<input type="date" required min={period.term.startsOn} max={period.term.endsOn} value={day.date} disabled={disabled} onChange={event => onChange({ ...contents, daysOff: contents.daysOff.map(row => row.id === day.id ? { ...row, date: event.target.value } : row) })} /></label>
      <label className={styles.field}>Название<input required minLength={2} maxLength={160} value={day.name} disabled={disabled} onChange={event => onChange({ ...contents, daysOff: contents.daysOff.map(row => row.id === day.id ? { ...row, name: event.target.value } : row) })} /></label>
      <button type="button" disabled={disabled} aria-label={`Удалить неучебный день ${day.date}`} onClick={() => onChange({ ...contents, daysOff: contents.daysOff.filter(row => row.id !== day.id) })}>Удалить</button>
    </div>)}<Pages page={currentDay} pages={dayPages} onChange={setDayPage} label="Неучебные дни" />
  </div>;
}
