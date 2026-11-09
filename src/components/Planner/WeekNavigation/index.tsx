import { format, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { toLocalDateKey } from "../../../domain/schedule";
import styles from "./index.module.scss";

interface Props { days: Date[]; counts: number[]; boardId: string; onSelect(day: Date): void }

const WeekNavigation = ({ days, counts, boardId, onSelect }: Props) => {
  return <nav className={styles.navigation} aria-label="Дни недели планировщика">
    <div className={styles.days}>{days.map((day, index) => <button type="button" key={toLocalDateKey(day)} className={styles.day} aria-current={isSameDay(day, new Date()) ? "date" : undefined} aria-controls={`${boardId}-${toLocalDateKey(day)}`} aria-label={`${format(day, "EEEE, d MMMM", { locale: ru })}. Задач: ${counts[index]}`} title={`Перейти к ${format(day, "d MMMM", { locale: ru })}`} onClick={() => onSelect(day)}><span>{format(day, "EEEEEE", { locale: ru })}</span><strong>{format(day, "d")}</strong>{counts[index] > 0 && <small>{counts[index]}</small>}</button>)}</div>
  </nav>;
};

export default WeekNavigation;
