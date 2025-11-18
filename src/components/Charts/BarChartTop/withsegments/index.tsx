import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import styles from "../../settingsCharts.module.scss";

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
    value: number;
    fillRatios: number[];
}

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

    // Цвет сегментов
    const activeColor = useMemo(() => {
        const cssValue = getComputedStyle(document.documentElement)
            .getPropertyValue("--bar-value-bg")
            .trim();
        const base = d3.color(cssValue) || d3.color("var(--bar-value-bg)");
        const hsl = d3.hsl(base!);
        if (colorMode === 1) return hsl.toString();
        const hueShift = (colorMode - 1) * 22.5;
        return d3.hsl((hsl.h + hueShift) % 360, hsl.s, hsl.l).toString();
    }, [colorMode]);

    // Glow цвет
    const glowColor = useMemo(() => {
        const c = d3.color(activeColor);
        if (!c) return activeColor;
        c.opacity = 0.35;
        return c.toString();
    }, [activeColor]);

    // Подготовка данных и fillRatio
    const chartData: ChartItem[] = useMemo(() => {
        return labels
            .map((label, i) => {
                const parts = label.trim().split(/\s+/);
                const last = parts[0] || "";
                const initial = parts[1] ? `${parts[1][0]}.` : "";
                const value = Math.min(values[i] ?? 0, maxValue);
                const vPerSeg = maxValue / segments;
                const fillRatios = Array.from({ length: segments }, (_, j) =>
                    Math.min(Math.max(value - j * vPerSeg, 0), vPerSeg) / vPerSeg
                );
                return {
                    key: `${label}__${i}`,
                    label: `${last} ${initial}`,
                    value,
                    fillRatios,
                };
            })
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [labels, values, maxValue, segments]);

    useEffect(() => {
        if (!svgRef.current) return;

        const svg = d3.select(svgRef.current);
        const containerWidth = svgRef.current.parentElement?.clientWidth ?? 400;

        const margin = { top: 15, right: 50, bottom: 10, left: 100 };
        const innerWidth = containerWidth - margin.left - margin.right;
        const innerHeight = chartData.length * barHeight;

        svg.attr("width", containerWidth).attr("height", innerHeight + margin.top + margin.bottom);

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
                .attr("id", "glow")
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

        const y = d3.scaleBand<string>()
            .domain(chartData.map(d => d.key))
            .range([0, innerHeight])
            .paddingInner(0.7);

        const segmentWidth = innerWidth / segments;
        const segmentPadding = 6;
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

        // BG
        rowsEnter.selectAll<SVGRectElement, number>("rect.bg")
            .data(() => Array.from({ length: segments }, (_, i) => i))
            .enter()
            .append("rect")
            .attr("class", "bg")
            .attr("x", d => d * segmentWidth)
            .attr("width", segmentWidth - segmentPadding)
            .attr("height", y.bandwidth())
            .attr("rx", 2)
            .attr("fill", inactiveColor);

        // ACTIVE
        rowsEnter.selectAll<SVGRectElement, { fillRatio: number; i: number }>("rect.active")
            .data(d => d.fillRatios.map((r, i) => ({ fillRatio: r, i })))
            .enter()
            .append("rect")
            .attr("class", "active")
            .attr("x", d => d.i * segmentWidth)
            .attr("width", 0)
            .attr("height", y.bandwidth())
            .attr("rx", 2)
            .attr("fill", activeColor)
            .attr("filter", "url(#glow)")
            .transition()
            .duration(700)
            .attr("width", d => (segmentWidth - segmentPadding) * d.fillRatio);

        // LABELS
        rowsEnter.append("text")
            .attr("x", -10)
            .attr("y", y.bandwidth() / 2)
            .attr("text-anchor", "end")
            .attr("alignment-baseline", "middle")
            .attr("fill", "var(--text-color)")
            .style("font-size", "11px")
            .text(d => d.label);

        // VALUE
        rowsEnter.append("text")
            .attr("x", innerWidth + 10)
            .attr("y", y.bandwidth() / 2)
            .attr("alignment-baseline", "middle")
            .attr("fill", "var(--text-color)")
            .style("font-size", "15px")
            .style("font-weight", "900")
            .text(d => Number.isInteger(d.value) ? d.value : d.value.toFixed(2));

        // UPDATE
        rows.attr("transform", d => `translate(0, ${y(d.key)})`);
        rows.selectAll<SVGRectElement, { fillRatio: number; i: number }>("rect.active")
            .data(d => d.fillRatios.map((r, i) => ({ fillRatio: r, i })))
            .transition()
            .duration(400)
            .attr("width", d => (segmentWidth - segmentPadding) * d.fillRatio);

        rows.select("text:last-of-type")
            .text(d => Number.isInteger(d.value) ? d.value : d.value.toFixed(2));

    }, [chartData, activeColor, glowColor, segments, barHeight]);

    return (
        <div
            className={styles.chartContainer}
            id={id ? String(id) : undefined}
            style={{ height: "auto", minHeight: height }}
        >
            <svg ref={svgRef} />
        </div>
    );
}
