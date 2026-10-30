import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import WeeklySchedule from "../../components/ScheduleWeek";
import WeekPicker from "../../components/WeekPicker";
import Filters, { type FilterResult } from "../../components/Filters";
import { getDemoWeekSchedule, getPersonalSchedule } from "../../data/schedule";
import { useRole } from "../../components/RoleContext";
import { filterSchedule, type ScheduleSearchType } from "../../domain/scheduleLayout";
import SearchIcon from "../../components/SearchIcon";
import ChevronIcon from "../../components/ChevronIcon";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import styles from "./index.module.scss";
import useManagedScheduleSnapshot from "../../hooks/useManagedScheduleSnapshot";
import { focusScheduleSearch } from "./searchFocus";

const CONTEXT_LABELS = { group: "Группа", auditory: "Аудитория", teacher: "Преподаватель" };

export default function ScheduleIndex() {
  const { currentUser } = useRole();
  const scheduleSource = useManagedScheduleSnapshot();
  const scheduleError = scheduleSource.error;
  const [searchParams, setSearchParams] = useSearchParams();
  const filterType = searchParams.get("type");
  const filterQuery = searchParams.get("query")?.trim() ?? "";
  const selectedSchedule: { title: string; type: ScheduleSearchType } | null = filterQuery && (filterType === "group" || filterType === "auditory" || filterType === "teacher")
    ? { title: filterQuery, type: filterType } : null;
  const dateParam = searchParams.get("date");
  const selectedWeek = useMemo(() => parseCalendarDate(dateParam) ?? new Date(), [dateParam]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchId = useId();
  const searchRef = useRef<HTMLElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    searchToggleRef.current?.focus({ preventScroll: true });
  }, []);
  const toggleSearch = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus({ preventScroll: true });
    setSearchOpen((open) => !open);
  };
  useLayoutEffect(() => {
    if (searchOpen) focusScheduleSearch(searchToggleRef.current, searchRef.current);
  }, [searchOpen]);
  useEffect(() => {
    if (!searchOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !searchRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      closeSearch();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [searchOpen, closeSearch]);

  const searchSchedule = (result: FilterResult) => {
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set("type", result.type); next.set("query", result.title); return next; });
    closeSearch();
  };
  const sourceSchedule = useMemo(() => getDemoWeekSchedule(selectedWeek, scheduleSource), [selectedWeek, scheduleSource]);
  const scheduleForWeek = useMemo(() => {
    if (!filterQuery || (filterType !== "group" && filterType !== "auditory" && filterType !== "teacher")) return getPersonalSchedule(sourceSchedule, currentUser);
    return filterSchedule(sourceSchedule, filterType, filterQuery);
  }, [sourceSchedule, filterType, filterQuery, currentUser]);

  return <div className={`pageContainer ${styles.page}`}>
    <WeekPicker value={selectedWeek} onWeekChange={(week) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set("date", toLocalDateKey(week)); return next; })} />
    <WeeklySchedule schedule={scheduleForWeek} selectedWeek={selectedWeek} readError={scheduleError} onRetry={scheduleSource.refresh} filtered={Boolean(selectedSchedule)} selectionContext={JSON.stringify(selectedSchedule ? [selectedSchedule.type, selectedSchedule.title] : ["personal"])}
      context={<div className={styles.context}><span>{selectedSchedule ? `${CONTEXT_LABELS[selectedSchedule.type]} · ${selectedSchedule.title}` : "Моё расписание"}</span>{selectedSchedule && <button type="button" onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.delete("type"); next.delete("query"); return next; })}>Моё расписание</button>}</div>}
      toolbarActions={<button type="button" ref={searchToggleRef} className={styles.searchToggle} aria-label="Поиск расписания" aria-expanded={searchOpen} aria-controls={searchId} onClick={toggleSearch}><SearchIcon /><span>Поиск</span><ChevronIcon size={14} direction={searchOpen ? "up" : "down"} /></button>}
      searchPanel={<section id={searchId} ref={searchRef} hidden={!searchOpen} className={styles.searchPanel} aria-label="Поиск другого расписания"><Filters schedule={sourceSchedule} selected={selectedSchedule} unavailable={Boolean(scheduleError)} onSearch={searchSchedule} onClose={closeSearch} /></section>}
    />
  </div>;
}
