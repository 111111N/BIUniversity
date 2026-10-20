import type { ReactNode } from "react";
import styles from "./index.module.scss";

interface Props {
  label: ReactNode;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
  className?: string;
}

const Checkbox = ({ label, checked, onChange, disabled = false, className = "" }: Props) => <label className={`${styles.checkbox} ${disabled ? styles.disabled : ""} ${className}`}>
  <span className={styles.control}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span className={styles.indicator} aria-hidden="true" /></span>
  <span className={styles.label}>{label}</span>
</label>;

export default Checkbox;
