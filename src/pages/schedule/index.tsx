import * as React from 'react';
import { useState, useMemo } from 'react';
import WeeklySchedule from '../../components/ScheduleWeek'; 
import WeekPicker from '../../components/WeekPicker';
import styles from './index.module.scss';
import Filters from "../../components/Filters";
import { generateMockMonthSchedule } from "./generator";
import { WeeklyScheduleData } from '../../types/sched';

const ScheduleIndex: React.FC = () => {
    const [selectedWeek, setSelectedWeek] = useState<Date>(new Date()); // выбранная неделя

    // --- Генерируем расписание на месяц один раз при монтировании ---
    const monthSchedule: WeeklyScheduleData = useMemo(
        () => generateMockMonthSchedule(new Date()), 
        []
    );

    // --- Фильтруем события только для выбранной недели ---
    const scheduleForWeek = useMemo(() => {
        const weekStart = new Date(selectedWeek);
        const day = weekStart.getDay();
        const diff = (day === 0 ? -6 : 1 - day); // смещаем на понедельник
        weekStart.setDate(weekStart.getDate() + diff);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        return monthSchedule.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= weekStart && itemDate <= weekEnd;
        });
    }, [selectedWeek, monthSchedule]);

    return (
        <div className="pageContainer">
            <h1 className={styles.title}>Ваше расписание на неделю</h1>
            
            <div className={styles.mainContent}>
                <div className={styles.scheduleColumn}>
                    <WeekPicker onWeekChange={(week: Date) => setSelectedWeek(week)} />
                    <WeeklySchedule schedule={scheduleForWeek} selectedWeek={selectedWeek} />
                </div>
                
                <div className={styles.filtersColumn}>
                    <Filters onSearch={() => {}} />
                </div>
            </div>
        </div>
    );
};

export default ScheduleIndex;
