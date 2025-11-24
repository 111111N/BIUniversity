import * as React from "react";
import { useRef, useEffect } from "react";
import * as d3 from "d3";
import styles from "../../settingsCharts.module.scss";

interface RadarDataPoint {
  seriesName: string;
  values: number[];
}

interface RadarChartProps {
  labels: string[];
  data: RadarDataPoint[];
  size?: number;
  maxValue?: number;
  colorMode?: number;
}

export default function RadarChart({
  labels,
  data,
  size = 300,
  maxValue = 5,
  colorMode = 0,
}: RadarChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = 40;
    const width = size + 2 * margin;
    const height = size + 2 * margin;
    const radius = size / 2;
    const centerX = width / 2;
    const centerY = height / 2;
    const angleSlice = (Math.PI * 2) / labels.length;

    svg.attr("width", width).attr("height", height);

    const mainGroup = svg
      .append("g")
      .attr("transform", `translate(${centerX}, ${centerY})`);

    const tooltip = d3
      .select(svgRef.current.parentElement)
      .append("div")
      .attr("class", styles.tooltip)
      .style("position", "absolute")
      .style("padding", "4px 8px")
      .style("background", "var(--grid-color)")
      .style("color", "var(--text-color)")
      .style("border", "1px solid var(--text-color)")
      .style("border-radius", "4px")
      .style("font-size", "11px")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("transition", "opacity 0.15s");

    const rScale = d3.scaleLinear().range([0, radius]).domain([0, maxValue]);

    const angleToCoords = (angle: number, value: number) => ({
      x: rScale(value) * Math.cos(angle - Math.PI / 2),
      y: rScale(value) * Math.sin(angle - Math.PI / 2),
    });

    const levels = d3.range(1, 6).map(i => (maxValue / 5) * i);

    mainGroup
      .selectAll(".grid-circle")
      .data(levels)
      .enter()
      .append("circle")
      .attr("class", "grid-circle")
      .attr("r", d => rScale(d))
      .style("fill", "var(--bg-dark-color)")
      .style("fill-opacity", 0.8)
      .style("stroke", "var(--text-color)")
      .style("stroke-opacity", 0.5);

    mainGroup
      .selectAll(".axis-line")
      .data(labels)
      .enter()
      .append("line")
      .attr("class", "axis-line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", (_, i) => angleToCoords(angleSlice * i, maxValue).x)
      .attr("y2", (_, i) => angleToCoords(angleSlice * i, maxValue).y)
      .style("stroke", "var(--text-color)")
      .style("stroke-opacity", 0.3)
      .style("stroke-width", 1);

    mainGroup
      .selectAll(".axis-label")
      .data(labels)
      .enter()
      .append("text")
      .attr("class", "axis-label")
      .attr("x", (_, i) => angleToCoords(angleSlice * i, maxValue * 1.15).x)
      .attr("y", (_, i) => angleToCoords(angleSlice * i, maxValue * 1.15).y)
      .style("font-size", "12px")
      .style("font-weight", "700")
      .style("text-anchor", "middle")
      .style("fill", "var(--text-color)")
      .text(d => d);

    // функция для расчета цвета серий от базового цвета --bar-value-bg
    const getSeriesColor = (index: number, total: number, colorMode: number) => {
      const baseColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--bar-value-bg')
        .trim();

      let h = 0, s = 70, l = 50;
      const rgb = d3.color(baseColor);
      if (rgb) {
        const hsl = d3.hsl(rgb);
        h = hsl.h;
        s = hsl.s * 100;
        l = hsl.l * 100;
      }

      const step = 360 / total; // равномерное распределение
      const hue = (h + step * index + colorMode * 22.5) % 360; // сдвиг по colorMode
      return `hsl(${hue}, ${s}%, ${l}%)`;
    };


    const radarLine = d3
      .line<{ x: number; y: number }>()
      .x(d => d.x)
      .y(d => d.y)
      .curve(d3.curveLinearClosed);

    const labelsGroup = mainGroup.append("g").attr("class", "value-labels");

    data.forEach((series, sIndex) => {
      const color = getSeriesColor(sIndex, data.length, colorMode);

      const seriesGroup = mainGroup
        .append("g")
        .attr("class", `series-group series-${sIndex}`);

      const coords = series.values.map((v, i) =>
        angleToCoords(angleSlice * i, v)
      );

      seriesGroup
        .append("path")
        .datum(coords)
        .attr("class", `radar-area radar-area-${sIndex}`)
        .attr("d", radarLine)
        .style("fill", color)
        .style("fill-opacity", 0.25)
        .style("stroke", color)
        .style("stroke-width", 2);

      seriesGroup
        .selectAll(".radar-point")
        .data(
          coords.map((p, i) => ({
            ...p,
            value: series.values[i],
            label: labels[i],
            color,
            sIndex,
            seriesName: series.seriesName,
          }))
        )
        .enter()
        .append("circle")
        .attr("class", `radar-point point-${sIndex}`)
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("r", 4)
        .style("fill", color)
        .style("cursor", "pointer")
        .on("mouseenter", function (event, d) {
          mainGroup.select(`.series-${d.sIndex}`).raise();
          mainGroup
            .select(`.radar-area-${d.sIndex}`)
            .transition()
            .duration(150)
            .style("fill-opacity", 0.7)
            .style("stroke-width", 3);

          d3.select(this)
            .transition()
            .duration(150)
            .attr("r", 7)
            .style("filter", "drop-shadow(0 0 4px white)");

          tooltip
            .style("opacity", 1)
            .html(`<b>${d.seriesName}</b><br/>${d.label}: <b>${d.value}</b>`);
        })
        .on("mousemove", function (event) {
          tooltip
            .style("left", event.offsetX + 20 + "px")
            .style("top", event.offsetY + 20 + "px");
        })
        .on("mouseleave", function (event, d) {
          mainGroup
            .select(`.radar-area-${d.sIndex}`)
            .transition()
            .duration(150)
            .style("fill-opacity", 0.35)
            .style("stroke-width", 2);

          d3.select(this)
            .transition()
            .duration(150)
            .attr("r", 4)
            .style("filter", "none");

          tooltip.style("opacity", 0);
        });
    });

    const legend = svg.append("g").attr("transform", `translate(${width - 130}, 20)`);

    data.forEach((series, i) => {
      const color = getSeriesColor(i, data.length, colorMode);
      const y = i * 22;

      const row = legend.append("g")
        .attr("class", `legend-item legend-${i}`)
        .style("cursor", "pointer")
        .on("mouseenter", () => {
          mainGroup.select(`.series-${i}`).raise();
          mainGroup
            .select(`.radar-area-${i}`)
            .transition()
            .duration(150)
            .style("fill-opacity", 0.7)
            .style("stroke-width", 3);

          mainGroup
            .selectAll(".axis-line")
            .transition()
            .duration(150)
            .style("stroke", color);

          labelsGroup.selectAll("*").remove();

          const seriesData = data[i];
          const coords = seriesData.values.map((v, idx) => {
            const angle = angleSlice * idx;
            return { ...angleToCoords(angle, v), value: v };
          });

          coords.forEach(d => {
            const text = labelsGroup
              .append("text")
              .attr("x", d.x)
              .attr("y", d.y - 10)
              .style("fill", color)
              .style("font-size", "12px")
              .style("font-weight", "600")
              .style("text-anchor", "middle")
              .text(d.value);

            const bbox = text.node()!.getBBox();

            labelsGroup
              .insert("rect", "text")
              .attr("x", bbox.x - 2)
              .attr("y", bbox.y - 1)
              .attr("width", bbox.width + 4)
              .attr("height", bbox.height + 2)
              .style("fill", "var(--grid-color)")
              .style("rx", 3)
              .style("ry", 3);
          });

          labelsGroup.raise();
        })
        .on("mouseleave", () => {
          mainGroup
            .select(`.radar-area-${i}`)
            .transition()
            .duration(150)
            .style("fill-opacity", 0.35)
            .style("stroke-width", 2);

          mainGroup
            .selectAll(".axis-line")
            .transition()
            .duration(150)
            .style("stroke", "var(--text-color)");

          labelsGroup.selectAll("*").remove();
        });

      row
        .append("rect")
        .attr("x", 25)
        .attr("y", y - 2)
        .attr("width", 100)
        .attr("height", 18)
        .style("fill", "var(--grid-color)")
        .style("opacity", 0.9)
        .style("stroke", "var(--text-color)")
        .style("stroke-width", 1)
        .style("stroke-opacity", 0.2)
        .style("rx", 4)
        .style("ry", 4);

      row
        .append("rect")
        .attr("x", 30)
        .attr("y", y)
        .attr("width", 12)
        .attr("height", 12)
        .style("fill", color);

      row
        .append("text")
        .attr("x", 48)
        .attr("y", y + 11)
        .style("font-size", "12px")
        .style("fill", color)
        .text(series.seriesName);
    });

    return () => {
      tooltip.remove();
    };
  }, [labels, data, size, maxValue, colorMode]);

  return (
    <div className={styles.chartContainer} style={{ position: "relative" }}>
      <svg ref={svgRef} />
    </div>
  );
}
