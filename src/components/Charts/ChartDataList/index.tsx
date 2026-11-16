import { useRef, type CSSProperties } from "react";
import styles from "./index.module.scss";

export interface ChartDataPoint { index: number; label: string; value: number | null }
interface Props { points: ChartDataPoint[]; label: string; selectedIndex?: number | null; onSelect?(index: number): void; overlayHeight?: number; onOpenChange?(open: boolean): void }
const formatValue = (value: number | null) => value === null ? "Нет отметок" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

export default function ChartDataList({ points, label, selectedIndex, onSelect, overlayHeight, onOpenChange }: Props) {
  const summaryRef = useRef<HTMLElement>(null);
  const selected = points.find((point) => point.index === selectedIndex && point.value !== null);
  return <details className={`${styles.details} ${overlayHeight !== undefined ? styles.overlay : ""}`} style={overlayHeight !== undefined ? { "--chart-data-height": `${overlayHeight}px` } as CSSProperties : undefined} onToggle={(event) => onOpenChange?.(event.currentTarget.open)} onKeyDownCapture={(event) => {
    if (event.key === "Escape" && event.currentTarget.open) {
      event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; summaryRef.current?.focus();
    }
  }}>
    <summary ref={summaryRef}><span className={styles.heading}><strong>Данные графика</strong><span>Периоды: {points.length}</span></span><span className={styles.summaryEnd}>{selected ? "Период выбран" : "По периодам"}<svg className={styles.chevron} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m6 9 6 6 6-6" /></svg></span></summary>
    <div className={styles.content}>
      <div className={styles.columns} aria-hidden="true"><span>Период</span><span>Посещаемость</span></div>
      <div className={styles.viewport} role="region" aria-label={label} tabIndex={0}><ul className={styles.list}>{points.map((point) => {
        const active = selected?.index === point.index;
        const className = `${styles.row} ${active ? styles.active : ""} ${point.value === null ? styles.unmarked : ""}`;
        const content = <><span className={styles.period}>{point.label}</span><span className={styles.track} aria-hidden="true"><span style={{ width: `${point.value ?? 0}%` }} /></span><strong className={styles.value}>{formatValue(point.value)}</strong><span className={styles.state} aria-hidden="true">{active && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>}</span></>;
        return <li key={point.index}>{onSelect && point.value !== null ? <button type="button" className={className} aria-pressed={active} aria-label={`${point.label}: ${formatValue(point.value)}. ${active ? "Снять фильтр периода" : "Выбрать период"}`} onClick={() => onSelect(point.index)}>{content}</button> : <div className={className}>{content}</div>}</li>;
      })}</ul></div>
    </div>
  </details>;
}
