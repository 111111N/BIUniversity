import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import styles from "../../settingsCharts.module.scss";

interface BarChartProps {
  labels: string[];
  values: number[];
  id?: string | number;   // ← добавлено по твоему запросу
  maxValue?: number;
  height?: number;
}

export default function BarChart({
  labels,
  values,
  id,
  maxValue,
  height = 350,
}: BarChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // --- Уникальные ключи, чтобы labels могли повторяться ---
  const keyedLabels = useMemo(
    () => labels.map((l, i) => `${l}__${i}`),
    [labels]
  );

  // --- Данные под длину labels ---
  const chartData = useMemo(
    () => (values ?? []).slice(0, labels.length),
    [values, labels]
  );

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const containerWidth =
      svgRef.current.parentElement?.clientWidth || 400;

    const margin = { top: 30, right: 40, bottom: 60, left: 40 };
    const innerWidth = Math.max(chartData.length * 60, containerWidth);
    const innerHeight = height - margin.top - margin.bottom;

    svg
      .attr("width", innerWidth + margin.left + margin.right)
      .attr("height", height);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // --- шкалы ---
    const xScale = d3
      .scaleBand<string>()
      .domain(keyedLabels)
      .range([0, innerWidth])
      .padding(0.3);

    const yScale = d3
      .scaleLinear()
      .domain([0, maxValue ?? Math.max(...chartData)])
      .range([innerHeight, 0])
      .nice();

    // --- сетка ---
    g.append("g")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(6)
          .tickSize(-innerWidth)
          .tickFormat(() => "")
      )
      .selectAll("line")
      .attr("stroke", "var(--grid-color)");

    g.select(".domain")?.remove();

    // --- оси ---
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickSize(0)
          .tickFormat((d) => {
            const index = keyedLabels.indexOf(d);
            return labels[index];
          })
      )
      .selectAll("text")
      .style("font-size", "12px")
      .attr("text-anchor", "end")
      .attr("transform", "rotate(-35)");

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(6))
      .selectAll("text")
      .style("font-size", "12px");

    // --- линейный градиент ---
    const defs = svg.append("defs");
    const barGradient = defs
      .append("linearGradient")
      .attr("id", "bar-gradient")
      .attr("x1", "0%")
      .attr("x2", "0%")
      .attr("y1", "0%")
      .attr("y2", "100%");

    barGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "var(--area-start)")
      .attr("stop-opacity", 0.7);

    barGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "var(--area-end)")
      .attr("stop-opacity", 0);



    // --- тултип ---
    const tooltip = d3
      .select("body")
      .append("div")
      .style("position", "absolute")
      .style("background", "var(--tooltip-bg)")
      .style("color", "var(--tooltip-text)")
      .style("padding", "5px 10px")
      .style("font-size", "14px")
      .style("border-radius", "8px")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", 10);

    // --- БАРЫ ---
    const bars = g
      .selectAll(".bar")
      .data(chartData)
      .join("rect")
      .attr("class", "bar")
      .attr("x", (_, i) => xScale(keyedLabels[i])!)
      .attr("y", innerHeight)
      .attr("width", xScale.bandwidth())
      .attr("height", 0)
      .attr("fill", "url(#bar-gradient)");

    // Анимация появления
    bars
      .transition()
      .duration(800)
      .attr("y", (d) => yScale(d))
      .attr("height", (d) => innerHeight - yScale(d));

    bars.on("mouseover", function (event, d) {
      const nodes = bars.nodes();
      const i = nodes.indexOf(this as SVGRectElement);


      tooltip
        .style("opacity", 1)
        .html(`${labels[i]}: ${d}`)
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 25 + "px");

      d3.select(this)
        .transition()
        .duration(150)
        .attr("fill", "var(--line-end)");
    });

    bars.on("mousemove", (event) => {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 25 + "px");
    });

    bars.on("mouseout", function () {
      tooltip.style("opacity", 0);


      d3.select(this)
        .transition()
        .duration(150)
        .attr("fill", "url(#bar-gradient)");
    });

    return () => {
      tooltip.remove();
    };
  }, [labels, chartData, maxValue, height, keyedLabels]);

  return (
    <div className={styles.chartContainer} id={id ? String(id) : undefined}>
      <svg ref={svgRef} />
    </div>
  );
}
