import styles from "./index.module.scss";

export type SortDirection = "asc" | "desc";

const SortControls = ({ value, onChange }: { value: SortDirection; onChange: (value: SortDirection) => void }) => (
  <div className={styles.controls} aria-label="Сортировка">
    <button className={value === "asc" ? styles.active : ""} onClick={() => onChange("asc")} title="По возрастанию" aria-label="Сортировать по возрастанию">↑</button>
    <button className={value === "desc" ? styles.active : ""} onClick={() => onChange("desc")} title="По убыванию" aria-label="Сортировать по убыванию">↓</button>
  </div>
);

export default SortControls;
