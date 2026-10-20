import type { AcademicLesson, LessonType } from "../../domain/academic";
import { lessonTypeLabels } from "../../domain/academic";
import styles from "./index.module.scss";

export type LessonTypeFilterValue = "all" | LessonType;
const types: LessonType[] = ["lecture", "practice", "laboratory"];

const LessonTypeFilter = ({ lessons, value, onChange }: { lessons: AcademicLesson[]; value: LessonTypeFilterValue; onChange(value: LessonTypeFilterValue): void }) => {
  const items: Array<{ value: LessonTypeFilterValue; label: string; count: number }> = [
    { value: "all", label: "Все занятия", count: lessons.length },
    ...types.map((type) => ({ value: type, label: lessonTypeLabels[type], count: lessons.filter((lesson) => lesson.type === type).length })),
  ];
  return <div className={styles.filter} aria-label="Фильтр по типу занятия">{items.map((item) => <button type="button" aria-pressed={value === item.value} className={value === item.value ? styles.active : ""} disabled={item.count === 0} onClick={() => onChange(item.value)} key={item.value}><span>{item.label}</span><strong>{item.count}</strong></button>)}</div>;
};
export default LessonTypeFilter;
