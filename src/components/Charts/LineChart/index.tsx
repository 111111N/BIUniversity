import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import styles from "../settingsCharts.module.scss";


interface LineChartProps {
  data?: number[];       
  labels?: string[];      
  length?: number;       
  height?: number;
}

export default function LineChart({
  data,
  labels,
  length = 7,
  height = 350,
}: LineChartProps) {
  const ref = useRef<SVGSVGElement | null>(null);
 
  // --- Генерация данных ---
  const chartData = useMemo(() => {
    if (data && data.length > 0) return data.slice(0, length);
    return Array.from({ length }, () => Math.floor(Math.random() * 100));
  }, [data, length]);

  // --- Метки оси X ---
  const xLabels = useMemo(() => {
    if (labels && labels.length > 0) return labels.slice(0, chartData.length);
    return chartData.map((_, i) => `${i + 1}`);
  }, [labels, chartData]);

  useEffect(() => {
    if (!ref.current) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const containerWidth = ref.current.parentElement?.clientWidth || 400;
    const margin = { top: 30, right: 60, bottom: 40, left: 40 };
    const innerWidth = Math.max(chartData.length * 20, containerWidth);
svg.attr("width", innerWidth + margin.left + margin.right)
   .attr("height", height);
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const numPoints = chartData.length;

    // --- Динамический размер точек и шрифта ---
    const circleRadius = Math.max(3, 10 - numPoints * 0.5);
    const xFontSize = Math.min(12, 20 - numPoints * 0.3);
    const yFontSize = Math.min(12, 20 - numPoints * 0.3);

    // --- Масштабы ---
    const xScale = d3.scalePoint()
      .domain(xLabels)
      .range([0, innerWidth])
      .padding(0.3);

    const yScale = d3.scaleLinear()
      .domain([0, Math.max(...chartData, 100)])
      .range([innerHeight, 0])
      .nice();

    // --- Сетка ---
    const gridGroup = g.append("g")
      .attr("class", "grid")
      .call(
        d3.axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => "")
      );

    gridGroup.select(".domain").attr("stroke", "none");
    gridGroup.selectAll("line")
      .attr("stroke", "var(--grid-color)")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 1);

    // --- Оси ---
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickSize(0))
      .selectAll("text")
      .style("font-size", `${xFontSize}px`)
      .attr("text-anchor", "middle");

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(5).tickFormat((d) => `${d}%`).tickSize(0))
      .selectAll("text")
      .style("font-size", `${yFontSize}px`)
      .attr("text-anchor", "end");

    g.select(".domain").remove();

    // --- Градиенты ---
    const defs = svg.append("defs");

    const lineGradient = defs.append("linearGradient")
      .attr("id", "line-gradient")
      .attr("x1", "0%").attr("x2", "100%")
      .attr("y1", "0%").attr("y2", "0%");
    lineGradient.append("stop").attr("offset", "0%").attr("stop-color", "var(--line-start)").attr("stop-opacity", 0.7);
    lineGradient.append("stop").attr("offset", "100%").attr("stop-color", "var(--line-end)").attr("stop-opacity", 0.7);

    const areaGradient = defs.append("linearGradient")
      .attr("id", "area-gradient")
      .attr("x1", "0%").attr("x2", "0%")
      .attr("y1", "0%").attr("y2", "100%");
    areaGradient.append("stop").attr("offset", "0%").attr("stop-color", "var(--area-start)").attr("stop-opacity", 0.7);
    areaGradient.append("stop").attr("offset", "100%").attr("stop-color", "var(--area-end)").attr("stop-opacity", 0);

    // --- Линия и область ---
    const line = d3.line<number>()
      .x((_, i) => xScale(xLabels[i])!)
      .y(d => yScale(d))
      .curve(d3.curveMonotoneX);

    const area = d3.area<number>()
      .x((_, i) => xScale(xLabels[i])!)
      .y0(innerHeight)
      .y1(d => yScale(d))
      .curve(d3.curveMonotoneX);

    const path = g.append("path")
      .datum(chartData)
      .attr("fill", "none")
      .attr("stroke", "url(#line-gradient)")
      .attr("stroke-width", 3)
      .attr("d", line);

    const totalLength = path.node()?.getTotalLength() || 0;
    path.attr("stroke-dasharray", totalLength)
      .attr("stroke-dashoffset", totalLength)
      .transition()
      .duration(1000)
      .ease(d3.easeCubic)
      .attr("stroke-dashoffset", 0);

    g.append("path")
      .datum(chartData)
      .attr("fill", "url(#area-gradient)")
      .attr("d", area)
      .attr("opacity", 0)
      .transition()
      .duration(1000)
      .attr("opacity", 1);

    // --- Тулы и точки ---
    const tooltip = d3.select("body")
      .append("div")
      .style("position", "absolute")
      .style("background", "var(--tooltip-bg)")
      .style("color", "var(--tooltip-text)")
      .style("font-size", "16px")
      .style("padding", "5px 10px")
      .style("border", "1px solid var(--tooltip-border)")
      .style("border-radius", "15px")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", 5);

    const hoverLine = g.append("line")
      .attr("stroke", "var(--hover-line)")
      .attr("stroke-dasharray", "4 4")
      .attr("opacity", 0);

    g.selectAll("circle")
      .data(chartData)
      .join("circle")
      .attr("cx", (_, i) => xScale(xLabels[i])!)
      .attr("cy", d => yScale(d))
      .attr("r", 0)
      .attr("fill", "none")
      .attr("stroke", "var(--circle-stroke)")
      .attr("stroke-width", 3)
      .on("mouseover", function (event, d) {
        const node = this as SVGCircleElement;
        const nodes = g.selectAll("circle").nodes();
        const i = nodes.indexOf(node);

        const x = xScale(xLabels[i])!;
        const y = yScale(d);

        tooltip.style("opacity", 1)
          .html(`${xLabels[i]}: ${d}%`)
          .style("left", event.pageX + 25 + "px")
          .style("top", event.pageY - 25 + "px");

        d3.select(node)
          .transition()
          .duration(200)
          .attr("r", circleRadius + 5)
          .attr("fill", "var(--circle-hover-fill)")
          .attr("stroke", "var(--circle-hover-stroke)");

        hoverLine.attr("x1", x)
          .attr("y1", innerHeight)
          .attr("x2", x)
          .attr("y2", y)
          .attr("opacity", 1);
      })
      .on("mousemove", (event) => {
        tooltip.style("left", event.pageX + 10 + "px")
               .style("top", event.pageY - 25 + "px");
      })
      .on("mouseout", (event) => {
        tooltip.style("opacity", 0);
        d3.select(event.currentTarget)
          .transition()
          .duration(200)
          .attr("r", circleRadius)
          .attr("fill", "none")
          .attr("stroke", "var(--circle-stroke)");

        hoverLine.attr("opacity", 0);
      })
      .transition()
      .duration(1000)
      .attr("r", circleRadius);

  }, [chartData, xLabels, height]);

return (
  <div className={styles.chartContainer}>
  <svg
    ref={ref}
    style={{ width: "560%" }}
  ></svg>
</div>
);


}
