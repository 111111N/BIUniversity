import { useId, useRef } from "react";
import styles from "./index.module.scss";

interface Props {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
}

const SearchField = ({ label, value, onChange, placeholder = "Поиск" }: Props) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.row}><input id={id} ref={inputRef} type="search" value={value} placeholder={placeholder} className={value ? styles.hasValue : ""} onChange={(event) => onChange(event.target.value)} />{value && <button type="button" aria-label={`Очистить: ${label}`} onClick={() => { onChange(""); inputRef.current?.focus(); }}>Очистить</button>}</div>
  </div>;
};

export default SearchField;
