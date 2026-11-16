import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as d3 from "d3";
import sharedStyles from "../settingsCharts.module.scss";
import styles from "./index.module.scss";
import ChartDataList, { type ChartDataPoint } from "../ChartDataList";

interface LineChartProps {
  data?: Array<number | null>;
  labels?: string[];
  axisLabels?: string[];
  length?: number;
  height?: number;
  label?: string;
  onPointSelect?(index: number): void;
  selectedIndex?: number | null;
}
type Point = ChartDataPoint & { axisLabel: string };
const formatValue = (value: number | null) => value === null ? "Нет отметок" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

export default function LineChart({ data, labels, axisLabels, length, height = 350, label = "Динамика посещаемости", onPointSelect, selectedIndex }: LineChartProps) {
  const id = `line-chart-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointRefs = useRef<Record<number, SVGGElement | null>>({});
  const axisRefs = useRef<Record<number, SVGGElement | null>>({});
  const [width, setWidth] = useState(360);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [tabStop, setTabStop] = useState(0);
  const [dataOpen, setDataOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 8, top: 8 });
  const points = useMemo<Point[]>(() => {
    const count = Number.isFinite(length) ? Math.max(0, Math.floor(length!)) : data?.length ?? 0;
    return (data ?? []).slice(0, count).map((value, index) => ({ index, label: labels?.[index] ?? `${index + 1}`, axisLabel: axisLabels?.[index] ?? labels?.[index] ?? `${index + 1}`, value: typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null }));
  }, [data, labels, axisLabels, length]);
  const available = points.filter((point) => point.value !== null);
  const effectiveTabStop = points.some((point) => point.index === tabStop) ? tabStop : points[0]?.index;
  const effectiveAxisTabStop = available.some((point) => point.index === tabStop) ? tabStop : available[0]?.index;
  const activeIndex = hovered ?? focused;
  const active = points.find((point) => point.index === activeIndex);
  const chartHeight = Number.isFinite(height) ? Math.max(160, height) : 350;
  const wrappedLabels = points.some((point) => point.axisLabel.length > 14 && point.axisLabel.includes(" — "));
  const tickLines = (point: Point) => wrappedLabels && point.axisLabel.includes(" — ") ? point.axisLabel.split(" — ").map((part, index) => index ? `— ${part}` : part) : [point.axisLabel];
  const tickWidth = (point: Point) => Math.max(...tickLines(point).map((part) => part.length * 6.2));
  const axisLabelHeight = wrappedLabels ? 44 : 28;
  const margin = { top: 24, right: 18, bottom: axisLabelHeight + 18, left: 44 };
  // Каждому периоду оставляем место для подписи и плашки; тесный график прокручивается.
  const slotWidth = Math.max(56, ...points.map((point) => tickWidth(point) + 24));
  const innerWidth = Math.max(1, width - margin.left - margin.right, points.length * slotWidth);
  const chartWidth = innerWidth + margin.left + margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;
  const x = d3.scalePoint<number>().domain(points.map((point) => point.index)).range([0, innerWidth]).padding(.5);
  const y = d3.scaleLinear().domain([0, 100]).range([innerHeight, 0]);
  const line = d3.line<Point>().x((point) => x(point.index) ?? 0).y((point) => y(point.value ?? 0)).curve(d3.curveMonotoneX);
  const area = d3.area<Point>().x((point) => x(point.index) ?? 0).y0(innerHeight).y1((point) => y(point.value ?? 0)).curve(d3.curveMonotoneX);
  // Для геометрии пустой день равен нулю; null сохраняется для подписи «Нет отметок».
  const linePath = line(points) ?? undefined;
  const areaPath = area(points) ?? undefined;
  const selected = available.find((point) => point.index === selectedIndex);
  // Границы недели проходят посередине между соседними точками, включая края графика.
  const selectedLeft = selected && selected.index > 0 ? ((x(selected.index - 1) ?? 0) + (x(selected.index) ?? 0)) / 2 : 0;
  const selectedRight = selected && selected.index < points.length - 1 ? ((x(selected.index) ?? 0) + (x(selected.index + 1) ?? innerWidth)) / 2 : innerWidth;
  const activeX = active ? margin.left + (x(active.index) ?? 0) - scrollLeft : 0;
  const pointY = (point: Point) => y(point.value ?? 0);
  const activeY = active ? margin.top + pointY(active) : 0;

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

  const movePoint = (event: KeyboardEvent<SVGGElement>, index: number, fromAxis = false) => {
    if (onPointSelect && points[index]?.value !== null && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onPointSelect(index); return; }
    if (event.key === "Escape") { setFocused(null); setHovered(null); return; }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const navigable = fromAxis ? available : points;
    const current = navigable.findIndex((point) => point.index === index);
    const next = event.key === "Home" ? 0 : event.key === "End" ? navigable.length - 1 : Math.max(0, Math.min(navigable.length - 1, current + (event.key === "ArrowRight" ? 1 : -1)));
    const nextPoint = navigable[next];
    setFocused(nextPoint.index);
    (fromAxis ? axisRefs : pointRefs).current[nextPoint.index]?.focus();
    const viewport = viewportRef.current;
    if (viewport) {
      const nextX = margin.left + (x(nextPoint.index) ?? 0);
      if (nextX < viewport.scrollLeft + slotWidth / 2) viewport.scrollLeft = Math.max(0, nextX - slotWidth / 2);
      else if (nextX > viewport.scrollLeft + width - slotWidth / 2) viewport.scrollLeft = nextX - width + slotWidth / 2;
    }
  };

  return <figure className={styles.figure}>
    <div ref={containerRef} className={`${styles.chart} ${selected ? styles.selectedChart : ""}`} inert={dataOpen} aria-hidden={dataOpen || undefined} onPointerLeave={() => setHovered(null)} onPointerCancel={() => setHovered(null)}>
      <div ref={viewportRef} className={`${sharedStyles.chartContainer} ${styles.plotViewport}`} style={{ height: chartHeight }} role="region" aria-label="Периоды графика" tabIndex={chartWidth > width ? 0 : undefined} onScroll={(event) => { setScrollLeft(event.currentTarget.scrollLeft); setHovered(null); }}>
      {points.length ? <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
        <title id={`${id}-title`}>{label}</title><desc id={`${id}-description`}>Стрелки влево и вправо переключают точки. Home и End — первая и последняя точка. {onPointSelect ? "Enter или пробел — выбрать неделю для фильтрации. " : ""}Значения также доступны в раскрываемом списке под графиком.</desc>
        <defs><linearGradient id={`${id}-line`} x1="0%" x2="100%" y1="0%" y2="0%"><stop offset="0%" stopColor="var(--line-start)" stopOpacity="var(--line-opacity)" /><stop offset="100%" stopColor="var(--line-end)" stopOpacity="var(--line-opacity)" /></linearGradient><linearGradient id={`${id}-area`} x1="0%" x2="0%" y1="0%" y2="100%"><stop offset="0%" stopColor="var(--area-start)" stopOpacity="var(--area-opacity)" /><stop offset="100%" stopColor="var(--area-end)" stopOpacity="0" /></linearGradient></defs>
        {selected && <defs><clipPath id={`${id}-selection`}><rect x={selectedLeft} y="0" width={selectedRight - selectedLeft} height={innerHeight} /></clipPath></defs>}
        <g transform={`translate(${margin.left},${margin.top})`}>
          {selected && <rect x={selectedLeft} y="0" width={selectedRight - selectedLeft} height={innerHeight} rx="4" className={styles.selectedBand} aria-hidden="true" />}
          {[0, 20, 40, 60, 80, 100].map((value) => <g key={value}><line x1="0" x2={innerWidth} y1={y(value)} y2={y(value)} className={styles.gridLine} /><text x="-9" y={y(value)} dy=".35em" textAnchor="end" className={styles.axisText}>{value}%</text></g>)}
          {points.map((point) => {
            const highlighted = selected?.index === point.index || activeIndex === point.index;
            const selectable = Boolean(onPointSelect && point.value !== null);
            return <g key={point.index} ref={(node) => { axisRefs.current[point.index] = node; }} transform={`translate(${x(point.index)},${innerHeight + 8})`} className={`${styles.axisLabel} ${selectable ? styles.axisSelectable : ""}`} role={selectable ? "button" : undefined} tabIndex={selectable ? point.index === effectiveAxisTabStop ? 0 : -1 : undefined} aria-pressed={selectable ? selectedIndex === point.index : undefined} aria-label={selectable ? `${point.label}: ${formatValue(point.value)}. ${selectedIndex === point.index ? "Снять фильтр периода" : "Выбрать период"}` : undefined} onClick={() => { if (selectable) onPointSelect?.(point.index); }} onKeyDown={(event) => { if (selectable) movePoint(event, point.index, true); }} onPointerEnter={() => setHovered(point.index)} onPointerLeave={() => setHovered(null)} onFocus={(event) => { setFocused(event.currentTarget.matches(":focus-visible") ? point.index : null); setTabStop(point.index); }} onBlur={() => setFocused(null)}>
              <rect x={-tickWidth(point) / 2 - 8} y="0" width={tickWidth(point) + 16} height={axisLabelHeight} rx="6" className={highlighted ? styles.axisBadge : styles.axisHitArea} />
              <text x="0" y="18" textAnchor="middle" className={`${styles.axisText} ${highlighted ? styles.highlightedAxisText : ""}`}>{tickLines(point).map((part, index) => <tspan key={index} x="0" dy={index ? 16 : 0}>{part}</tspan>)}</text>
            </g>;
          })}
          <path d={areaPath} fill={`url(#${id}-area)`} className={styles.area} clipPath={selected ? `url(#${id}-selection)` : undefined} />
          <path d={linePath} stroke={`url(#${id}-line)`} className={styles.line} />
          {selected && <path d={linePath} className={styles.selectedLine} clipPath={`url(#${id}-selection)`} aria-hidden="true" />}
          {active && active.value !== null && <line x1={x(active.index)} x2={x(active.index)} y1={y(active.value)} y2={innerHeight} className={styles.guide} />}
          {points.map((point) => <g key={point.index} ref={(node) => { pointRefs.current[point.index] = node; }} transform={`translate(${x(point.index)},${pointY(point)})`} role={onPointSelect && point.value !== null ? "button" : "img"} aria-pressed={onPointSelect && point.value !== null ? selectedIndex === point.index : undefined} aria-label={`${point.label}: ${formatValue(point.value)}${onPointSelect && point.value !== null ? ". Фильтровать по этой неделе" : ""}`} tabIndex={point.index === effectiveTabStop ? 0 : -1} className={styles.point} onClick={() => { if (point.value !== null) onPointSelect?.(point.index); }} onPointerEnter={() => setHovered(point.index)} onPointerLeave={() => setHovered(null)} onPointerDown={() => setFocused(null)} onFocus={(event) => { setFocused(event.currentTarget.matches(":focus-visible") ? point.index : null); setTabStop(point.index); }} onBlur={() => setFocused(null)} onKeyDown={(event) => movePoint(event, point.index)}>
            <circle r="13" fill="transparent" />
            {(point.index === activeIndex || point.index === selectedIndex) && <circle r="9" className={styles.focusRing} />}
            <circle r={point.value === null ? 3 : point.index === activeIndex || point.index === selectedIndex ? 6 : points.length > 15 ? 3.5 : 5} className={`${styles.dot} ${point.value === null ? styles.emptyDot : point.index === activeIndex || point.index === selectedIndex ? styles.activeDot : ""}`} />
          </g>)}
        </g>
      </svg> : <div className={styles.empty} style={{ minHeight: chartHeight }}><strong>Нет данных для графика</strong><span>Заполненные отметки появятся здесь после внесения в журнал.</span></div>}
      </div>
      {active && <div ref={tooltipRef} className={styles.tooltip} style={tooltipPosition} role="tooltip"><strong>{active.label}</strong><span>{formatValue(active.value)}</span></div>}
    </div>
    {points.length > 0 && <ChartDataList points={points} label={label} selectedIndex={selectedIndex} onSelect={onPointSelect} overlayHeight={chartHeight} onOpenChange={setDataOpen} />}
  </figure>;
}
