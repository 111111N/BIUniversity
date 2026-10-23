import { KeyboardEvent, useEffect, useRef } from "react";
import styles from "./index.module.scss";

export interface TabItem { value: string; label: string; count?: number }
interface TabsProps { items: TabItem[]; value: string; ariaLabel: string; onChange(value: string): void; className?: string; variant?: "navigation" | "filter" }

const Tabs = ({ items, value, ariaLabel, onChange, className = "", variant = "navigation" }: TabsProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const keyboardTarget = useRef<string | null>(null);
  const activeValue = items.some((item) => item.value === value) ? value : items[0]?.value;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (keyboardTarget.current === activeValue && !document.querySelector('[role="dialog"][aria-modal="true"]')) active?.focus({ preventScroll: true });
    keyboardTarget.current = null;
    const revealActive = () => {
      const active = root.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if (!active) return;
      const bounds = root.getBoundingClientRect();
      const tab = active.getBoundingClientRect();
      // Scroll only the tab strip, preserving the page position and restored profile context.
      const delta = tab.width > root.clientWidth || tab.left < bounds.left ? tab.left - bounds.left : tab.right > bounds.left + root.clientWidth ? tab.right - bounds.left - root.clientWidth : 0;
      if (delta) root.scrollLeft += delta;
    };
    revealActive();
    const observer = new ResizeObserver(revealActive);
    observer.observe(root);
    return () => observer.disconnect();
  }, [activeValue]);

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !items.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const index = items.findIndex((item) => item.value === activeValue);
    const next = items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + direction + items.length) % items.length];
    keyboardTarget.current = next.value;
    onChange(next.value);
    requestAnimationFrame(() => {
      const active = rootRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      // A dirty-form guard may reject the change and focus its confirmation dialog.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) keyboardTarget.current = null;
      else if (active?.dataset.tab === next.value) {
        active.focus({ preventScroll: true });
        keyboardTarget.current = null;
      }
      // Lazy routes may commit later; the effect focuses only the requested, committed tab.
    });
  };

  return <div ref={rootRef} className={`${styles.tabs} ${styles[variant]} ${className}`} role="tablist" aria-label={ariaLabel}>{items.map((item) => <button type="button" role="tab" data-tab={item.value} aria-selected={activeValue === item.value} tabIndex={activeValue === item.value ? 0 : -1} className={activeValue === item.value ? styles.active : ""} onKeyDown={move} onClick={() => { keyboardTarget.current = null; onChange(item.value); }} key={item.value}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div>;
};

export default Tabs;
