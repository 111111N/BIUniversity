import * as React from 'react';
import { useState, useMemo, useId, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import WeeklySchedule from '../../components/ScheduleWeek'; 
import WeekPicker from '../../components/WeekPicker';
import styles from './index.module.scss';
import Filters, { FilterResult } from "../../components/Filters";
import { getDemoWeekSchedule, getPersonalSchedule } from "../../data/schedule";
import { useRole } from '../../components/RoleContext';
import { filterSchedule, type ScheduleSearchType } from '../../domain/scheduleLayout';
import ArrowCircle from '../../components/ArrowCircle';
import { parseCalendarDate } from '../../domain/calendar';
import { toLocalDateKey } from '../../domain/schedule';

const ScheduleIndex: React.FC = () => {
    const { role } = useRole();
    const [searchParams, setSearchParams] = useSearchParams();
    const filterType = searchParams.get('type');
    const filterQuery = searchParams.get('query')?.trim() ?? '';
    const selectedSchedule: { title: string; type: ScheduleSearchType } | null = filterQuery && (filterType === 'group' || filterType === 'auditory' || filterType === 'teacher')
        ? { title: filterQuery, type: filterType } : null;
    const dateParam = searchParams.get('date');
    const selectedWeek = useMemo(() => parseCalendarDate(dateParam) ?? new Date(), [dateParam]);
    const [searchOpen, setSearchOpen] = useState(false);
    const searchId = useId();
    const searchRef = useRef<HTMLElement>(null);
    const searchToggleRef = useRef<HTMLButtonElement>(null);
    const toggleSearch = () => {
        setSearchOpen((open) => !open);
        if (!searchOpen) requestAnimationFrame(() => searchRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus());
    };
    const searchSchedule = (result: FilterResult) => {
        setSearchParams((current) => { const next = new URLSearchParams(current); next.set('type', result.type); next.set('query', result.title); return next; });
        setSearchOpen(false);
        if (window.matchMedia('(max-width: 1100px)').matches) searchToggleRef.current?.focus();
    };

    const sourceSchedule = useMemo(() => getDemoWeekSchedule(selectedWeek), [selectedWeek]);
    const scheduleForWeek = useMemo(() => {
        const schedule = sourceSchedule;
        if (!filterQuery || (filterType !== 'group' && filterType !== 'auditory' && filterType !== 'teacher')) return getPersonalSchedule(schedule, role);
        return filterSchedule(schedule, filterType, filterQuery);
    }, [sourceSchedule, filterType, filterQuery, role]);

    return (
        <div className="pageContainer">
            <div className={`${styles.toolbar} ${selectedSchedule ? styles.hasSelection : ""}`}>
                {selectedSchedule && <span className={styles.selection}>{selectedSchedule.title}</span>}
                <div className={styles.headerActions}>{selectedSchedule && <button onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('type'); next.delete('query'); return next; })}>Моё расписание</button>}<button type="button" ref={searchToggleRef} className={styles.mobileSearchToggle} aria-expanded={searchOpen} aria-controls={searchId} onClick={toggleSearch}>Найти расписание<ArrowCircle direction={searchOpen ? "up" : "down"} /></button></div>
            </div>
            
            <div className={styles.mainContent}>
                <div className={styles.scheduleColumn}>
                    <WeekPicker value={selectedWeek} onWeekChange={(week: Date) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('date', toLocalDateKey(week)); return next; })} />
                    <WeeklySchedule schedule={scheduleForWeek} selectedWeek={selectedWeek} />
                </div>
                <aside id={searchId} ref={searchRef} className={`${styles.searchColumn} ${!searchOpen ? styles.searchClosed : ""}`} aria-label="Поиск другого расписания"><Filters schedule={sourceSchedule} selected={selectedSchedule} onSearch={searchSchedule} /></aside>
                
            </div>
        </div>
    );
};

export default ScheduleIndex;
