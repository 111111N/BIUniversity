import { useEffect, useLayoutEffect, useRef, useMemo, useState, useId } from "react";
import * as d3 from "d3";
import styles from "../../settingsCharts.module.scss";
import { useTheme } from "../../../ThemeContext";

interface BarChartProps {
    labels: string[];
    values: number[];
    id?: string | number;
    maxValue?: number;
    height?: number;
    barHeight?: number;
    segments?: number;
    colorMode?: number;
}

interface ChartItem {
    key: string;
    label: string;
    fullLabel: string;
    value: number;
    fillRatios: number[];
}

const LIGHT_MODE_COLOR: Record<number, string> = {
    2: "--ui-chart-amber",
    7: "--ui-chart-green",
    8: "--ui-chart-blue",
    15: "--ui-chart-purple",
};

export default function BarChart({
    labels,
    values,
    id,
    maxValue = 100,
    height = 350,
    barHeight = 15,
    segments = 10,
    colorMode = 1,
}: BarChartProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const previousWidth = useRef<number | null>(null);
    const [width, setWidth] = useState(400);
    const glowId = `bar-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const { theme } = useTheme();
    const limit = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 1;
    const segmentCount = Number.isFinite(segments) ? Math.max(1, Math.floor(segments)) : 10;

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const update = () => setWidth(Math.max(1, Math.round(container.getBoundingClientRect().width)));
        update();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", update);
            return () => window.removeEventListener("resize", update);
        }
        const observer = new ResizeObserver(update);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // Цвет сегментов
    const cssValue = getComputedStyle(document.documentElement)
        .getPropertyValue(theme === "light" ? LIGHT_MODE_COLOR[colorMode] ?? "--ui-chart-red" : "--ui-accent-primary")
        .trim();
    const baseColor = d3.hsl(cssValue || "#f54c4c");
    const activeColor = theme === "light" || colorMode === 1
        ? baseColor.toString()
        : d3.hsl((baseColor.h + (colorMode - 1) * 22.5) % 360, baseColor.s, baseColor.l).toString();

    // Glow цвет
    const glowColor = d3.color(activeColor)?.copy({ opacity: theme === "light" ? .12 : .35 }).toString() ?? activeColor;

    // Подготовка данных и fillRatio
    const chartData: ChartItem[] = useMemo(() => {
        return labels
            .map((label, i) => {
                const parts = label.trim().split(/\s+/);
                const last = parts[0] || "";
                const initial = parts[1] ? `${parts[1][0]}.` : "";
                const value = Math.min(Number.isFinite(values[i]) ? Math.max(0, values[i]) : 0, limit);
                const vPerSeg = limit / segmentCount;
                const fillRatios = Array.from({ length: segmentCount }, (_, j) =>
                    Math.min(Math.max(value - j * vPerSeg, 0), vPerSeg) / vPerSeg
                );
                return {
                    key: `${label}__${i}`,
                    label: `${last} ${initial}`,
                    fullLabel: label,
                    value,
                    fillRatios,
                };
            })
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [labels, values, limit, segmentCount]);

    useEffect(() => {
        if (!svgRef.current) return;

        const svg = d3.select(svgRef.current);
        svg.attr("data-theme", theme);
        const containerWidth = width;
        const resized = previousWidth.current !== containerWidth;
        previousWidth.current = containerWidth;

        const margin = { top: 15, right: 50, bottom: 10, left: Math.min(100, containerWidth * .36) };
        const innerWidth = Math.max(1, containerWidth - margin.left - margin.right);
        const innerHeight = chartData.length * barHeight;

        svg.attr("width", containerWidth).attr("height", innerHeight + margin.top + margin.bottom);
        svg.attr("role", "img").attr("aria-label", chartData.map((item) => `${item.fullLabel}: ${item.value}`).join("; ") || "Нет данных для диаграммы");

        // Группа для графика
        let group = svg.select<SVGGElement>(".chart-group");
        if (group.empty()) {
            group = svg.append<SVGGElement>("g").attr("class", "chart-group");
        }
        group.attr("transform", `translate(${margin.left},${margin.top})`);

        // defs + glow один раз
        let defs: d3.Selection<SVGDefsElement, unknown, null, undefined> = svg.select<SVGDefsElement>("defs");
        if (defs.empty()) {
            defs = svg.append<SVGDefsElement>("defs");
            const glow = defs.append<SVGFilterElement>("filter")
                .attr("id", glowId)
                .attr("x", "-20%")
                .attr("y", "-20%")
                .attr("width", "140%")
                .attr("height", "140%");
            
            glow.append("feGaussianBlur").attr("stdDeviation", 1.5).attr("result", "blur");
            glow.append("feFlood").attr("flood-color", glowColor).attr("result", "glow");
            glow.append("feComposite").attr("in", "glow").attr("in2", "blur").attr("operator", "in");
            glow.append("feMerge").html(`
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
            `);
        }
        defs.select("feFlood").attr("flood-color", glowColor);

        const y = d3.scaleBand<string>()
            .domain(chartData.map(d => d.key))
            .range([0, innerHeight])
            .paddingInner(0.7);

        const segmentWidth = innerWidth / segmentCount;
        const segmentPadding = Math.min(6, segmentWidth * .2);
        const inactiveColor = "var(--bar-bg)";

        // DATA JOIN
        const rows = group.selectAll<SVGGElement, ChartItem>(".row")
            .data(chartData, d => d.key);

        // EXIT
        rows.exit().remove();

        // ENTER
        const rowsEnter = rows.enter()
            .append("g")
            .attr("class", "row")
            .attr("transform", d => `translate(0, ${y(d.key)})`);
        const allRows = rowsEnter.merge(rows);
        allRows.attr("transform", d => `translate(0, ${y(d.key)})`);
        rowsEnter.append("title");
        allRows.select("title").text(d => `${d.fullLabel}: ${d.value}`);

        // BG
        allRows.selectAll<SVGRectElement, number>("rect.bg")
            .data(() => Array.from({ length: segmentCount }, (_, i) => i))
            .join("rect")
            .attr("class", "bg")
            .attr("x", d => d * segmentWidth)
            .attr("width", segmentWidth - segmentPadding)
            .attr("height", y.bandwidth())
            .attr("rx", 2)
            .attr("fill", inactiveColor);

        // ACTIVE
        const activeBars = allRows.selectAll<SVGRectElement, { fillRatio: number; i: number }>("rect.active")
            .data(d => d.fillRatios.map((r, i) => ({ fillRatio: r, i })))
            .join("rect")
            .interrupt()
            .attr("class", "active")
            .attr("x", d => d.i * segmentWidth)
            .attr("height", y.bandwidth())
            .attr("rx", 2)
            .attr("fill", activeColor)
            .attr("filter", theme === "light" ? null : `url(#${glowId})`);
        if (resized || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            activeBars.attr("width", d => (segmentWidth - segmentPadding) * d.fillRatio);
        } else {
            activeBars.transition().duration(400).attr("width", d => (segmentWidth - segmentPadding) * d.fillRatio);
        }

        // LABELS
        rowsEnter.append("text")
            .attr("class", "row-label");
        allRows.select<SVGTextElement>("text.row-label")
            .attr("x", -10)
            .attr("y", y.bandwidth() / 2)
            .attr("text-anchor", "end")
            .attr("alignment-baseline", "middle")
            .attr("fill", "var(--text-color)")
            .style("font-size", "12px")
            .text(d => d.label)
            .each(function () {
                let label = this.textContent ?? "";
                while (label.length > 1 && this.getComputedTextLength() > margin.left - 12) {
                    label = label.slice(0, -1);
                    this.textContent = `${label}…`;
                }
            });

        // VALUE
        rowsEnter.append("text")
            .attr("class", "row-value");
        allRows.select("text.row-value")
            .attr("x", innerWidth + 10)
            .attr("y", y.bandwidth() / 2)
            .attr("alignment-baseline", "middle")
            .attr("fill", "var(--text-color)")
            .style("font-size", "15px")
            .style("font-weight", "900")
            .text(d => Number.isInteger(d.value) ? d.value : d.value.toFixed(2));

        return () => { svg.selectAll("*").interrupt(); };
    }, [chartData, activeColor, glowColor, segmentCount, barHeight, theme, width, glowId]);

    return (
        <div
            ref={containerRef}
            className={styles.chartContainer}
            id={id ? String(id) : undefined}
            style={{ height: "auto", minHeight: height }}
        >
            <svg ref={svgRef} />
        </div>
    );
}
