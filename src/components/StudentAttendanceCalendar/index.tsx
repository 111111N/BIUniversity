import styles from "./index.module.scss";

interface StudentAttendanceCalendarProps { subject: string; attendance: number }
const lessons = Array.from({ length: 18 }, (_, index) => ({ day: index + 1, status: index === 4 ? "sick" : index === 10 || index === 15 ? "absent" : "present" }));
const statusLabel = { present: "Присутствовал", absent: "Пропуск", sick: "По болезни" } as const;

const StudentAttendanceCalendar = ({ subject, attendance }: StudentAttendanceCalendarProps) => <section className={styles.card} aria-label={`Посещаемость по предмету ${subject}`}>
  <header><div><span>Сентябрь 2026</span><h2>Посещаемость</h2></div><strong>{attendance}%</strong></header>
  <div className={styles.weekdays}>{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"].map((day) => <span key={day}>{day}</span>)}</div>
  <div className={styles.days}>{lessons.map((lesson) => <div className={styles[lesson.status]} title={statusLabel[lesson.status as keyof typeof statusLabel]} key={lesson.day}><span>{lesson.day}</span><i /></div>)}</div>
  <footer>{Object.entries(statusLabel).map(([status, label]) => <span key={status}><i className={styles[status]} />{label}</span>)}</footer>
</section>;
export default StudentAttendanceCalendar;
