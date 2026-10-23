import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as d3 from "d3";
import sharedStyles from "../settingsCharts.module.scss";
import styles from "./index.module.scss";
import ChartDataList, { type ChartDataPoint } from "../ChartDataList";

interface LineChartProps {
  data?: Array<number | null>;
  labels?: string[];
  length?: number;
  height?: number;
  label?: string;
  onPointSelect?(index: number): void;
  selectedIndex?: number | null;
}
type Point = ChartDataPoint;
const formatValue = (value: number | null) => value === null ? "Нет отметок" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

export default function LineChart({ data, labels, length, height = 350, label = "Динамика посещаемости", onPointSelect, selectedIndex }: LineChartProps) {
  const id = `line-chart-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointRefs = useRef<Record<number, SVGGElement | null>>({});
  const [width, setWidth] = useState(360);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [tabStop, setTabStop] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 8, top: 8 });
  const points = useMemo<Point[]>(() => {
    const count = Number.isFinite(length) ? Math.max(0, Math.floor(length!)) : data?.length ?? 0;
    return (data ?? []).slice(0, count).map((value, index) => ({ index, label: labels?.[index] ?? `${index + 1}`, value: typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null }));
  }, [data, labels, length]);
  const available = points.filter((point) => point.value !== null);
  const effectiveTabStop = available.some((point) => point.index === tabStop) ? tabStop : available[0]?.index;
  const activeIndex = hovered ?? focused;
  const active = points.find((point) => point.index === activeIndex && point.value !== null);
  const chartHeight = Number.isFinite(height) ? Math.max(160, height) : 350;
  const wrappedLabels = points.some((point) => point.label.length > 14 && point.label.includes(" — "));
  const margin = { top: 24, right: 18, bottom: wrappedLabels ? 50 : 36, left: 44 };
  const innerWidth = Math.max(1, width - margin.left - margin.right);
  const innerHeight = chartHeight - margin.top - margin.bottom;
  const x = d3.scalePoint<number>().domain(points.map((point) => point.index)).range([0, innerWidth]).padding(.35);
  const y = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);
  const tickLines = (point: Point) => wrappedLabels && point.label.includes(" — ") ? point.label.split(" — ").map((part, index) => index ? `— ${part}` : part) : [point.label];
  const tickWidth = (point: Point) => Math.max(...tickLines(point).map((part) => part.length * 6.2));
  const ticks = points.length <= 1 ? points : (() => {
    const first = points[0], last = points[points.length - 1];
    let rightEdge = (x(first.index) ?? 0) + tickWidth(first);
    const lastLeft = (x(last.index) ?? 0) - tickWidth(last);
    // Full labels remain available in the tooltip and data list when the axis is too narrow.
    if (lastLeft < rightEdge + 12) return [first];
    const visible = [first];
    points.slice(1, -1).forEach((point) => {
      const center = x(point.index) ?? 0, halfWidth = tickWidth(point) / 2;
      if (center - halfWidth >= rightEdge + 12 && center + halfWidth <= lastLeft - 12) {
        visible.push(point); rightEdge = center + halfWidth;
      }
    });
    return [...visible, last];
  })();
  const line = d3.line<Point>().defined((point) => point.value !== null).x((point) => x(point.index) ?? 0).y((point) => y(point.value ?? 0)).curve(d3.curveMonotoneX);
  const area = d3.area<Point>().defined((point) => point.value !== null).x((point) => x(point.index) ?? 0).y0(innerHeight).y1((point) => y(point.value ?? 0)).curve(d3.curveMonotoneX);
  const activeX = active ? margin.left + (x(active.index) ?? 0) : 0;
  const activeY = active ? margin.top + y(active.value!) : 0;

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    const bounds = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(width - bounds.width - 8, activeX + 14));
    const top = Math.max(8, activeY - bounds.height - 12);
    setTooltipPosition((current) => current.left === left && current.top === top ? current : { left, top });
  }, [active?.label, active?.value, activeX, activeY, width]);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const next = Math.max(1, Math.round(node.getBoundingClientRect().width));
      setWidth((current) => current === next ? current : next);
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const movePoint = (event: KeyboardEvent<SVGGElement>, index: number) => {
    if (onPointSelect && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onPointSelect(index); return; }
    if (event.key === "Escape") { setFocused(null); setHovered(null); return; }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = available.findIndex((point) => point.index === index);
    const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : Math.max(0, Math.min(available.length - 1, current + (event.key === "ArrowRight" ? 1 : -1)));
    setFocused(available[next].index);
    pointRefs.current[available[next].index]?.focus();
  };

  return <figure className={styles.figure}>
    <div ref={containerRef} className={`${sharedStyles.chartContainer} ${styles.chart}`} onPointerLeave={() => setHovered(null)} onPointerCancel={() => setHovered(null)}>
      {available.length ? <svg width="100%" height={chartHeight} viewBox={`0 0 ${width} ${chartHeight}`} role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
        <title id={`${id}-title`}>{label}</title><desc id={`${id}-description`}>Стрелки влево и вправо переключают точки. Home и End — первая и последняя точка. {onPointSelect ? "Enter или пробел — выбрать неделю для фильтрации. " : ""}Значения также доступны в раскрываемом списке под графиком.</desc>
        <defs><linearGradient id={`${id}-line`} x1="0%" x2="100%" y1="0%" y2="0%"><stop offset="0%" stopColor="var(--line-start)" stopOpacity="var(--line-opacity)" /><stop offset="100%" stopColor="var(--line-end)" stopOpacity="var(--line-opacity)" /></linearGradient><linearGradient id={`${id}-area`} x1="0%" x2="0%" y1="0%" y2="100%"><stop offset="0%" stopColor="var(--area-start)" stopOpacity="var(--area-opacity)" /><stop offset="100%" stopColor="var(--area-end)" stopOpacity="0" /></linearGradient></defs>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {[0, 20, 40, 60, 80, 100].map((value) => <g key={value}><line x1="0" x2={innerWidth} y1={y(value)} y2={y(value)} className={styles.gridLine} /><text x="-9" y={y(value)} dy=".35em" textAnchor="end" className={styles.axisText}>{value}%</text></g>)}
          {ticks.map((point) => <text key={point.index} x={x(point.index)} y={innerHeight + 23} textAnchor={points.length === 1 ? "middle" : point.index === 0 ? "start" : point.index === points.length - 1 ? "end" : "middle"} className={styles.axisText}>{tickLines(point).map((part, index) => <tspan key={index} x={x(point.index)} dy={index ? "1.3em" : 0}>{part}</tspan>)}</text>)}
          <path d={area(points) ?? undefined} fill={`url(#${id}-area)`} className={styles.area} />
          <path d={line(points) ?? undefined} stroke={`url(#${id}-line)`} className={styles.line} />
          {active && <line x1={x(active.index)} x2={x(active.index)} y1={y(active.value!)} y2={innerHeight} className={styles.guide} />}
          {available.map((point) => <g key={point.index} ref={(node) => { pointRefs.current[point.index] = node; }} transform={`translate(${x(point.index)},${y(point.value!)})`} role={onPointSelect ? "button" : "img"} aria-pressed={onPointSelect ? selectedIndex === point.index : undefined} aria-label={`${point.label}: ${formatValue(point.value)}${onPointSelect ? ". Фильтровать по этой неделе" : ""}`} tabIndex={point.index === effectiveTabStop ? 0 : -1} className={styles.point} onClick={() => onPointSelect?.(point.index)} onPointerEnter={() => setHovered(point.index)} onPointerLeave={() => setHovered(null)} onPointerDown={() => setFocused(null)} onFocus={(event) => { setFocused(event.currentTarget.matches(":focus-visible") ? point.index : null); setTabStop(point.index); }} onBlur={() => setFocused(null)} onKeyDown={(event) => movePoint(event, point.index)}>
            <circle r="13" fill="transparent" />
            {(point.index === activeIndex || point.index === selectedIndex) && <circle r="9" className={styles.focusRing} />}
            <circle r={point.index === activeIndex ? 6 : points.length > 15 ? 3.5 : 5} className={`${styles.dot} ${point.index === activeIndex ? styles.activeDot : ""}`} />
          </g>)}
        </g>
      </svg> : <div className={styles.empty} style={{ minHeight: chartHeight }}><strong>Нет данных для графика</strong><span>Заполненные отметки появятся здесь после внесения в журнал.</span></div>}
      {active && <div ref={tooltipRef} className={styles.tooltip} style={tooltipPosition} role="tooltip"><strong>{active.label}</strong><span>{formatValue(active.value)}</span></div>}
    </div>
    {points.length > 0 && <ChartDataList points={points} label={label} selectedIndex={selectedIndex} onSelect={onPointSelect} />}
  </figure>;
}
