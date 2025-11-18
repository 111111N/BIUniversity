import * as React from "react";
import styles from "./index.module.scss";

interface CalendarProps {
  months?: number;
}

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
function getMonthMatrix(year: number, month: number) {

  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = new Array(7).fill(null);

  for (let i = 0; i < daysInMonth; i++) {
    const dayOfWeek = (firstDay + i) % 7;
    week[dayOfWeek] = i + 1;

    if (dayOfWeek === 6 || i === daysInMonth - 1) {
      weeks.push(week);
      week = new Array(7).fill(null);
    }
  }

  return weeks;
}


const Calendar: React.FC<CalendarProps> = ({ months = 2 }) => {
  const today = new Date();

  const renderedMonths = Array.from({ length: months }, (_, idx) => {
    const date = new Date(today.getFullYear(), today.getMonth() + idx, 1);

    const monthName = date.toLocaleString("ru", { month: "short" });
    const year = date.getFullYear();
    const monthMatrix = getMonthMatrix(year, date.getMonth());

    const isCurrentMonth = idx === 0;

    return (
      <div
        key={idx}
        className={`${styles.calendarMonth} ${isCurrentMonth ? styles.currentMonth : styles.nextMonth}`}
      >

        <h4 className={styles.monthName}>{monthName}</h4>
        <div className={styles.calendarGrid}>

          {DAYS.map((day) => (
            <div key={day} className={styles.calendarDayName}>

              {day.charAt(0)}
            </div>
          ))}

          {monthMatrix.map((week, wIdx) =>
            week.map((day, dIdx) => {

              const dayOfWeek = (wIdx * 7 + dIdx) % 7;

              const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

              return (
                <div
                  key={`${wIdx}-${dIdx}`}
                  className={`${styles.calendarDay} 
                              ${isWeekend && day ? styles.weekend : ''}
                              ${day === today.getDate() && date.getMonth() === today.getMonth() ? styles.today : ""}
                              ${day ? styles.activeDay : ''}
                              `}
                >
                  {day || ""}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  });

  return <div className={styles.calendarContainer}>{renderedMonths}</div>;
};

export default Calendar;