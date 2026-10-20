import { KeyboardEvent, useRef } from "react";
import styles from "./index.module.scss";

export interface TabItem { value: string; label: string; count?: number }
interface TabsProps { items: TabItem[]; value: string; ariaLabel: string; onChange(value: string): void; className?: string }

const Tabs = ({ items, value, ariaLabel, onChange, className = "" }: TabsProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const index = items.findIndex((item) => item.value === value);
    const next = items[(index + direction + items.length) % items.length];
    onChange(next.value);
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.value}"]`)?.focus());
  };

  return <div ref={rootRef} className={`${styles.tabs} ${className}`} role="tablist" aria-label={ariaLabel} tabIndex={0} onKeyDown={move}>{items.map((item) => <button type="button" role="tab" data-tab={item.value} aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} className={value === item.value ? styles.active : ""} onClick={() => onChange(item.value)} key={item.value}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div>;
};

export default Tabs;
