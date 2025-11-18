import * as React from 'react';
import { useState, useMemo } from 'react';
import Select, { SingleValue, StylesConfig } from 'react-select';
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
import { ArrowIcon } from '../ButtonIcons/Icons';

const WEEK_OPTIONS = { locale: ru, weekStartsOn: 1 as 1 };
const START_SEPTEMBER = (year: number) => new Date(year, 8, 1); // 1 сентября

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

const getWeekNumberAndType = (date: Date) => {
  const yearStart = START_SEPTEMBER(date.getFullYear());
  const weekNumber = differenceInCalendarWeeks(date, yearStart, WEEK_OPTIONS) + 1;
  const type = weekNumber % 2 === 1 ? 'числ.' : 'знам.';
  return { weekNumber, type };
};

interface WeekOption {
  value: Date;
  label: string;
}

interface WeekPickerProps {
  onWeekChange?: (week: Date) => void;
}

const WeekPicker: React.FC<WeekPickerProps> = ({ onWeekChange }) => {
  const today = useMemo(() => new Date(), []);
  const [currentDate, setCurrentDate] = useState<Date>(today);

  const weeks: WeekOption[] = useMemo(() => {
    const yearStart = START_SEPTEMBER(today.getFullYear());
    const yearEnd = new Date(today.getFullYear(), 11, 31);
    const list: WeekOption[] = [];
    let current = yearStart;

    while (current <= yearEnd) {
      const start = startOfWeek(current, WEEK_OPTIONS);
      const end = endOfWeek(current, WEEK_OPTIONS);
      const { weekNumber, type } = getWeekNumberAndType(start);

      list.push({
        value: start,
        label: `${formatDateRange(start, end)} (неделя ${weekNumber}, ${type})`,
      });

      current = addWeeks(current, 1);
    }
    return list;
  }, [today]);

  const minWeek = weeks[0]?.value;
  const maxWeek = weeks[weeks.length - 1]?.value;
  const goToCurrentWeek = () => {
  setCurrentDate(today);
  onWeekChange?.(today);
  };
  const changeWeek = (offset: number) => {
    setCurrentDate((prev) => {
      const next = addWeeks(prev, offset);
      if (minWeek && isBefore(next, minWeek)) return minWeek;
      if (maxWeek && isAfter(next, maxWeek)) return maxWeek;
      onWeekChange?.(next);
      return next;
    });
  };

  const handleChange = (selected: SingleValue<WeekOption>) => {
    if (selected) {
      setCurrentDate(selected.value);
      onWeekChange?.(selected.value);
    }
  };

  const customStyles: StylesConfig<WeekOption, false> = {
    control: (provided, state) => ({
      ...provided,
      backgroundColor: 'var(--weekpicker-option-bg)',
      borderRadius: '17px 17px 0px 0px',
      borderBlock: `3px solid ${state.isFocused ? 'var(--weekpicker-bg)' : 'var(--weekpicker-border)'}`,
      borderTop: 'none',
      borderInline: `3px solid ${state.isFocused ? 'var(--weekpicker-focus-border)' : 'var(--weekpicker-border)'}`,
      boxShadow: 'none',
      padding: '2px 8px',
      cursor: 'pointer',
      transition: 'all 0.2s ease-out',
      '&:hover': {
        borderColor: 'var(--weekpicker-focus-border)',
        color: 'var(--weekpicker-hover-text)',
        backgroundColor: 'var(--weekpicker-active-bg)',
      },
      '&:active': {
        borderBlockColor: 'var(--weekpicker-active-bg)',
        borderInlineColor: 'var(--weekpicker-focus-border)',
        backgroundColor: 'var(--weekpicker-bg)',
      },
    }),
    singleValue: (provided) => ({
      ...provided,
      color: 'var(--weekpicker-hover-text)',
    }),
    menu: (provided) => ({
      ...provided,
      backgroundColor: 'var(--weekpicker-option-bg)',
      borderRadius: '0 0 8px 8px',
      zIndex: 9999,
      marginTop: 0,
      position: 'absolute',
      top: '100%',
      borderLeft: '3px solid var(--weekpicker-border)',
      borderBottom: '3px solid var(--weekpicker-border)',
      boxShadow: 'none',
      WebkitBoxShadow: 'inset 0px 10px 3px -3px #000000b3',
    }),
    option: (provided, state) => ({
      ...provided,
      background: state.isSelected
        ? 'var(--weekpicker-gradient)'
        : state.isFocused
          ? 'var(--weekpicker-hover-bg)'
          : 'var(--weekpicker-bg)',
      border: `3px solid ${
        state.isSelected
          ? '#191919'
          : state.isFocused
            ? 'var(--weekpicker-focus-border)'
            : 'var(--weekpicker-bg)'
      }`,
      color: state.isSelected
        ? ''
        : state.isFocused
          ? 'var(--weekpicker-hover-text)'
          : 'var(--weekpicker-text)',
      cursor: 'pointer',
      '&:active': {
        backgroundColor: 'var(--weekpicker-active-bg)',
        color: 'var(--weekpicker-hover-text)',
        borderColor: 'var(--weekpicker-hover-bg)',
        '&::last-child': {
          borderRadius: '0 0 17px 17px',
        },
      },
    }),
    dropdownIndicator: (provided, state) => ({
      ...provided,
      color: 'var(--weekpicker-hover-text)',
      transition: 'transform 0.2s ease',
      transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
      '&:hover': {
        color: 'var(--weekpicker-hover-text)',
      },
    }),
    indicatorSeparator: () => ({ display: 'none' }),
  };

  return (
    <div className={styles.weekPicker}>
      <div className={styles.weekPickerControls}>
        <div className={styles.weekPickerDisplayWrapper}>
          <Select
            value={weeks.find(
              (w) =>
                w.value.getTime() ===
                startOfWeek(currentDate, WEEK_OPTIONS).getTime()
            )}
            onChange={handleChange}
            options={weeks}
            styles={customStyles}
            isSearchable={false}
          />
        </div>

        <button
          className={styles.weekPickerArrow}
          onClick={() => changeWeek(-1)}
          disabled={minWeek && isBefore(addWeeks(currentDate, -1), minWeek)}
          aria-label="Предыдущая неделя"
        >
          <ArrowIcon direction="left" />
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
          <ArrowIcon direction="right" />
        </button>
      </div>
    </div>
  );
};

export default WeekPicker;
