import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import styles from "../settingsCharts.module.scss";

interface BarChartProps {
    labels: string[];
    values: number[];
    id?: string | number;
    maxValue?: number;
    height?: number;
    barHeight?: number;
}

export default function BarChart({
    labels,
    values,
    id,
    maxValue,
    height = 350,
    barHeight = 30,
}: BarChartProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);

    const keyedData = useMemo(() => {
        return labels.map((label, i) => ({
            key: `${label}__${i}`,
            label,
            value: values[i] ?? 0,
            index: i,
        }));
    }, [labels, values]);

    const chartData = useMemo(() => [...keyedData].sort((a, b) => b.value - a.value), [keyedData]);

    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();

        const containerWidth = svgRef.current.parentElement?.clientWidth || 400;
        const margin = { top: 0, right: 0, bottom: 0, left: 0 };
        const innerWidth = containerWidth - margin.left - margin.right;

        const maxVisibleBars = Math.floor(height / barHeight);
        const visibleData = chartData.slice(0, maxVisibleBars);

        svg.attr("width", containerWidth).attr("height", height);
        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        const yScale = d3
            .scaleBand()
            .domain(visibleData.map((d) => d.key))
            .range([0, barHeight * visibleData.length])
            .padding(0);

        const xScale = d3
            .scaleLinear()
            .domain([0, maxValue ?? d3.max(visibleData, (d) => d.value)!])
            .range([0, innerWidth])
            .nice();

        // --- горизонтальный градиент ---
        const defs = svg.append("defs");
        const barGradient = defs
            .append("linearGradient")
            .attr("id", "bar-gradient")
            .attr("x1", "0%")
            .attr("x2", "100%")
            .attr("y1", "0%")
            .attr("y2", "0%");

        barGradient.append("stop").attr("offset", "0%").attr("stop-color", "#f54c4c");
        barGradient.append("stop").attr("offset", "100%").attr("stop-color", "#74253a");

        const filter = defs.append("filter").attr("id", "drop-shadow");
    filter.append("feDropShadow")
        .attr("dx", 0)
        .attr("dy", 2)
        .attr("stdDeviation", 3)
        .attr("flood-color", "#000")
        .attr("flood-opacity", 1);
        // --- заполнение градиентом ---
        const bars = g
            .selectAll(".bar")
            .data(visibleData.slice().reverse()) 
            .join("rect")
            .attr("class", "bar")
            .attr("y", (d) => yScale(d.key)!)
            .attr("x", 0)
            .attr("height", barHeight)
            .attr("width", 0)
            .attr("fill", "url(#bar-gradient)")
            
            .attr("filter", "url(#drop-shadow)"); // <-- применяем тень

        bars.transition().duration(800).attr("width", (d) => xScale(d.value));

        // --- подписи и значения в квадрате ---
        const labelsGroup = g
            .selectAll(".bar-label")
            .data(visibleData)
            .join("g")
            .attr("class", "bar-label")
            
            .attr("transform", (d) => `translate(0, ${yScale(d.key)!})`);

        labelsGroup
            .append("text")
            .attr("x", 5 + 15) // центрируем текст в квадрате
            .attr("y", barHeight / 1.7)
            .attr("alignment-baseline", "middle")
            .attr("text-anchor", "middle")
            .attr("fill", "var(--value-color)")
            .style("font-size", "22px")
            .attr("font-weight", "900")
            .text((d) => d.value);

        // Метка справа
        labelsGroup
            .append("text")
            .attr("x", 45)
            .attr("y", barHeight / 1.75)
            .attr("alignment-baseline", "middle")
            .attr("fill", "var(--text-color)")
            .style("font-size", "22px")
            .attr("font-weight", "900")
            .text((d) => d.label);
    }, [chartData, height, maxValue, barHeight]);

    return (
        <div className={styles.chartContainer} id={id ? String(id) : undefined}>
            <svg ref={svgRef} />
        </div>
    );
}
