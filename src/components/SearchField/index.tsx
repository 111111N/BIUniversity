import { useId, useRef } from "react";
import SearchIcon from "../SearchIcon";
import styles from "./index.module.scss";

interface Props {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  withIcon?: boolean;
  error?: string;
}

const SearchField = ({ label, value, onChange, placeholder = "Поиск", withIcon = false, error }: Props) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.row}>{withIcon && <SearchIcon className={styles.icon} />}<input id={id} ref={inputRef} type="search" value={value} placeholder={placeholder} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={`${withIcon ? styles.withIcon : ""} ${value ? styles.hasValue : ""}`} onChange={(event) => onChange(event.target.value)} />{value && <button type="button" aria-label={`Очистить: ${label}`} onClick={() => { onChange(""); inputRef.current?.focus(); }}>Очистить</button>}</div>
    {error && <span id={`${id}-error`} className={styles.error} role="alert">{error}</span>}
  </div>;
};

export default SearchField;
