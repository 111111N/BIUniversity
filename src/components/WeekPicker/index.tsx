import * as React from 'react';
import { useState, useMemo } from 'react';
import Dropdown from '../Dropdown';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  format,
  differenceInCalendarWeeks,
  isBefore,
  isAfter,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import styles from './index.module.scss';
import ArrowCircle from '../ArrowCircle';

const WEEK_OPTIONS = { locale: ru, weekStartsOn: 1 as 1 };


const formatDateRange = (startDate: Date, endDate: Date): string => {
  const startDay = format(startDate, 'd', WEEK_OPTIONS);
  const startMonth = format(startDate, 'MMMM', WEEK_OPTIONS);
  const endDay = format(endDate, 'd', WEEK_OPTIONS);
  const endMonth = format(endDate, 'MMMM', WEEK_OPTIONS);
  const year = format(endDate, 'yyyy', WEEK_OPTIONS);

  if (startMonth === endMonth) {
    return `${startDay} - ${endDay} ${endMonth} ${year} г.`;
  } else {
    return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year} г.`;
  }
};
const getWeekNumberAndType = (date: Date, start: Date) => {
  const weekNumber =
    differenceInCalendarWeeks(date, start, WEEK_OPTIONS) + 1;

  const type = weekNumber % 2 === 1 ? 'числ.' : 'знам.';
  return { weekNumber, type };
};

const getAcademicYearBounds = (date: Date) => {
  const month = date.getMonth(); // 0 = январь
  const year = date.getFullYear();

  // январь–июль → учебный год начался в прошлом году
  const startYear = month < 8 ? year - 1 : year;

  const start = new Date(startYear, 8, 1); // 1 сентября
  const end = new Date(startYear + 1, 6, 31); // 31 июля

  return { start, end };
};

interface WeekOption {
  value: Date;
  label: string;
}

interface WeekPickerProps {
  onWeekChange?: (week: Date) => void;
  value?: Date;
}

const WeekPicker: React.FC<WeekPickerProps> = ({ onWeekChange, value }) => {
  const today = useMemo(() => new Date(), []);
  const [internalDate, setCurrentDate] = useState<Date>(today);
  const currentDate = value ?? internalDate;
const weeks: WeekOption[] = useMemo(() => {
  // A Monday can fall in August while its teaching week already includes 1 September.
  const { start, end } = getAcademicYearBounds(endOfWeek(currentDate, WEEK_OPTIONS));

  const list: WeekOption[] = [];
  let current = startOfWeek(start, WEEK_OPTIONS);

  while (!isAfter(current, end)) {
    const weekStart = startOfWeek(current, WEEK_OPTIONS);
    const weekEnd = endOfWeek(current, WEEK_OPTIONS);
    const { weekNumber, type } = getWeekNumberAndType(weekStart, start);

    list.push({
      value: weekStart,
      label: `${formatDateRange(isBefore(weekStart, start) ? start : weekStart, isAfter(weekEnd, end) ? end : weekEnd)} (неделя ${weekNumber}, ${type})`,
    });

    current = addWeeks(current, 1);
  }

  return list;
}, [currentDate]);


  const minWeek = weeks[0]?.value;
  const maxWeek = weeks[weeks.length - 1]?.value;
  const goToCurrentWeek = () => {
  setCurrentDate(today);
  onWeekChange?.(today);
  };
  const changeWeek = (offset: number) => {
    const next = addWeeks(currentDate, offset);
    const bounded = minWeek && isBefore(next, minWeek) ? minWeek : maxWeek && isAfter(next, maxWeek) ? maxWeek : next;
    setCurrentDate(bounded);
    onWeekChange?.(bounded);
  };

  const handleChange = (value: string) => {
    const selected = weeks.find((week) => String(week.value.getTime()) === value);
    if (!selected) return;
    setCurrentDate(selected.value);
    onWeekChange?.(selected.value);
  };

  return (
    <div className={styles.weekPicker}>
      <div className={styles.weekPickerControls}>
        <div className={styles.weekPickerDisplayWrapper}>
          <Dropdown
            variant="main"
            label="Учебная неделя"
            hideLabel
            value={String(startOfWeek(currentDate, WEEK_OPTIONS).getTime())}
            onChange={handleChange}
            options={weeks.map((week) => ({ value: String(week.value.getTime()), label: week.label }))}
          />
        </div>

        <button
          className={styles.weekPickerArrow}
          onClick={() => changeWeek(-1)}
          disabled={minWeek && isBefore(addWeeks(currentDate, -1), minWeek)}
          aria-label="Предыдущая неделя"
        >
          <ArrowCircle direction="left" />
        </button>

        <button
          className={styles.weekPickerCurrentButton}
          onClick={goToCurrentWeek}
        >
          Текущая неделя
        </button>

        <button
          className={styles.weekPickerArrow}
          onClick={() => changeWeek(1)}
          disabled={maxWeek && isAfter(addWeeks(currentDate, 1), maxWeek)}
          aria-label="Следующая неделя"
        >
          <ArrowCircle />
        </button>
      </div>
    </div>
  );
};

export default WeekPicker;
