import { useState, useEffect, useMemo } from "react";
import LineChart from "../../components/Charts/LineChart";
import Calendar from "../../components/CalendarWidget";
import Schedule, { ScheduleItem } from "../../components/ScheduleWidget";
import Search from "../../components/SearchWidget";
import styles from "./index.module.scss";

export default function Home() {
  const [searchMode, setSearchMode] = useState<"group" | "auditorium">("group");
  const [query, setQuery] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());

  const data = useMemo(() => Array.from({ length: 100 }, () => Math.floor(Math.random() * 100)), []);

  const schedule = useMemo<ScheduleItem[]>(
    () => [
      { time: "02:01-03:00", subject: "Математический анализ", group: "121-МКо, 424/1" },
      { time: "03:01-04:00", subject: "Математический анализ", group: "121-МКо, 424/1" },
      { time: "04:01-05:00", subject: "Математический анализ", group: "121-МКо, 424/1" },
      { time: "10:10-11:40", subject: "Линейная алгебра", group: "121-МКо, 424/1" },
      { time: "12:40-14:10", subject: "Информатика", group: "121-МКо, 424/1" },
      { time: "14:20-15:50", subject: "История", group: "121-МКо, 424/1" },
      { time: "16:00-17:30", subject: "Физика", group: "121-МКо, 424/1" },
      { time: "17:40-19:10", subject: "Литература", group: "121-МКо, 424/1" },
      { time: "19:20-20:50", subject: "Философия", group: "121-МКо, 424/1" },
      { time: "21:00-22:30", subject: "Социология", group: "121-МКо, 424/1" },
    ],
    []
  );

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="pageContainer">
      
      <h1 className={styles.title}>Главная</h1>

      <div className={styles.dashboardGrid}>
        <div className={styles.leftColumn}>
          <Search
            searchMode={searchMode}
            setSearchMode={setSearchMode}
            query={query}
            setQuery={setQuery}
            onSearch= {() => {}}
          />

          <div className={styles.dashboardCard}>
            <h3 className={styles.cardTitle}>Расписание на сегодня</h3>
            <Schedule schedule={schedule} currentTime={currentTime} />
          </div>

          <div className={`${styles.dashboardCard} ${styles.flexParams}`}>
            <div className={styles.paramBox}>
              <div className={styles.summaryValue}>3 / 5</div>
              <div className={styles.summaryLabel}>Проведено пар</div>
            </div>
            <div className={styles.paramBox}>
              <div className={styles.summaryValue}>3 / 5</div>
              <div className={styles.summaryLabel}>Проставлено посещаемости</div>
            </div>
            <div className={styles.paramBox}>
              <div className={styles.summaryValue}>22 / 22</div>
              <div className={styles.summaryLabel}>Проставлено оценок</div>
            </div>
          </div>
        </div>

        <div className={styles.rightColumn}>
          <div className={styles.dashboardCard}>
            <h3 className={styles.cardTitle}>Общий график посещаемости</h3>
            <LineChart length={100} data={data} height={200} />
          </div>

          <div className={styles.dashboardCard}>
            <h3 className={styles.cardTitle}>Календарь</h3>
            <Calendar months={2} />
          </div>
        </div>
      </div>
    </div>
  );
}
