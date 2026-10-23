import * as React from "react";
import { useRef, useEffect, useId, useState } from "react";
import * as d3 from "d3";
import styles from "../../settingsCharts.module.scss";
import { useTheme } from "../../../ThemeContext";
import { getVisibleRadarMaximum } from "../../../../domain/radarScale";

interface RadarDataPoint {
  seriesName: string;
  values: number[];
  colorToken?: string;
}

interface RadarChartProps {
  labels: string[];
  data: RadarDataPoint[];
  size?: number;
  colorMode?: number;
}

export default function RadarChart({
  labels,
  data,
  size = 300,
  colorMode = 0,
}: RadarChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clipId = `radar-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [compactLegend, setCompactLegend] = useState(true);
  const enabledRef = useRef(new Map<string, boolean>());
  const { theme } = useTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setCompactLegend(container.clientWidth < 440);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    const container = containerRef.current;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (!labels.length || !data.length) return;
    // ================== состояние видимости серий ==================
    const seriesEnabled = new Map<number, boolean>();
    data.forEach((series, i) => seriesEnabled.set(i, enabledRef.current.get(series.seriesName) ?? true));
    let maxValue = getVisibleRadarMaximum(data, seriesEnabled);

    const margin = 40;
    const width = size + 2 * margin;
    const plotHeight = size + 2 * margin;
    const legendHeight = compactLegend ? Math.ceil(data.length / 2) * 28 + 8 : 0;
    const height = plotHeight + legendHeight;
    const radius = size / 2;
    const centerX = width / 2;
    const centerY = plotHeight / 2 + legendHeight;
    const angleSlice = (Math.PI * 2) / labels.length;

    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height)
      .style("width", "100%").style("height", "auto").style("max-width", `${width}px`);
    const updateCaption = () => {
      const anyEnabled = [...seriesEnabled.values()].some(Boolean);
      svg.attr("data-max-value", maxValue).attr("aria-label", anyEnabled ? `Лепестковый график. Шкала от 0 до ${maxValue}` : "Все ряды скрыты");
    };
    updateCaption();
    svg.attr("data-legend-layout", compactLegend ? "top" : "corner");
    svg.append("defs").append("clipPath").attr("id", clipId)
      .append("circle").attr("r", radius + 4);

    const mainGroup = svg
      .append("g")
      .attr("transform", `translate(${centerX}, ${centerY})`);

    const tooltip = d3
      .select(container)
      .append("div")
      .attr("data-radar-tooltip", "")
      .attr("role", "tooltip").attr("aria-hidden", "true")
      .style("position", "absolute")
      .style("display", "grid").style("gap", "3px")
      .style("box-sizing", "border-box").style("max-width", "min(220px, calc(100% - 16px))")
      .style("padding", "8px 10px")
      .style("background", "var(--tooltip-bg)")
      .style("color", "var(--tooltip-text)")
      .style("border", "1px solid var(--tooltip-border)")
      .style("border-radius", "6px")
      .style("font-size", "12px").style("line-height", "1.4")
      .style("z-index", "2")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("transition", "opacity 0.15s");

    const positionTooltip = (event: MouseEvent) => {
      const [x, y] = d3.pointer(event, container);
      const bounds = tooltip.node()!.getBoundingClientRect();
      const left = Math.max(8, Math.min(x + 14, container.clientWidth - bounds.width - 8));
      const top = Math.max(8, y + bounds.height + 22 > container.clientHeight ? y - bounds.height - 14 : y + 14);
      tooltip.style("left", `${left}px`).style("top", `${top}px`);
    };

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
      .style("pointer-events", "none")
      .attr("r", d => rScale(d))
      .style("fill", "none")
      .style("stroke", "var(--radar-grid-stroke)")
      .style("stroke-opacity", theme === "light" ? .95 : .4)
      .style("stroke-width", 1);

    mainGroup
      .selectAll(".axis-line")
      .data(labels)
      .enter()
      .append("line")
      .attr("class", "axis-line")
      .style("pointer-events", "none")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", (_, i) => angleToCoords(angleSlice * i, maxValue).x)
      .attr("y2", (_, i) => angleToCoords(angleSlice * i, maxValue).y)
      .style("stroke", "var(--radar-axis-stroke)")
      .style("stroke-opacity", theme === "light" ? .7 : .3)
      .style("stroke-width", 1);

    mainGroup
      .selectAll(".axis-label")
      .data(labels)
      .enter()
      .append("text")
      .attr("class", "axis-label")
      .style("pointer-events", "none")
      .attr("x", (_, i) => angleToCoords(angleSlice * i, maxValue * 1.15).x)
      .attr("y", (_, i) => angleToCoords(angleSlice * i, maxValue * 1.15).y)
      .style("font-size", "12px")
      .style("font-weight", "700")
      .style("text-anchor", "middle")
      .style("fill", "var(--text-color)")
      .text(d => d);

    // Для светлой темы берём отдельный яркий цвет данных, не текстовый акцент.
    const getSeriesColor = (index: number, total: number, colorMode: number) => {
      const colorToken = data[index]?.colorToken;
      if (colorToken) return getComputedStyle(document.documentElement).getPropertyValue(colorToken).trim();
      if (theme === "light") {
        const tokens = colorMode === 7
          ? ["--ui-chart-green", "--ui-chart-blue", "--ui-chart-red", "--ui-chart-amber"]
          : colorMode === 6
            ? ["--ui-chart-green", "--ui-chart-purple"]
            : ["--ui-chart-red", "--ui-chart-blue", "--ui-chart-green", "--ui-chart-purple"];
        return getComputedStyle(document.documentElement).getPropertyValue(tokens[index % tokens.length]).trim();
      }
      const baseColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--ui-accent-primary')
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

    const labelsGroup = mainGroup.append("g").attr("class", "value-labels").style("pointer-events", "none");
    const resetPointHover = () => {
      mainGroup.selectAll(".radar-point").interrupt().attr("r", 4).style("filter", "none");
      mainGroup.selectAll(".radar-area").interrupt().style("fill-opacity", .25).style("stroke-width", 2);
      tooltip.style("opacity", 0).attr("aria-hidden", "true");
    };
    svg.on("mouseleave.radar", resetPointHover).on("pointercancel.radar", resetPointHover);

    data.forEach((series, sIndex) => {
      const color = getSeriesColor(sIndex, data.length, colorMode);

      const seriesGroup = mainGroup
        .append("g")
        .attr("class", `series-group series-${sIndex}`)
        .attr("clip-path", `url(#${clipId})`)
        .style("opacity", seriesEnabled.get(sIndex) ? 1 : 0)
        .style("pointer-events", seriesEnabled.get(sIndex) ? "all" : "none");

      const coords = series.values.map((v, i) =>
        angleToCoords(angleSlice * i, v)
      );

      seriesGroup
        .append("path")
        .datum(coords)
        .attr("class", `radar-area radar-area-${sIndex}`)
        .style("pointer-events", "none")
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
          if (!seriesEnabled.get(d.sIndex)) return
          resetPointHover();
          mainGroup
            .select(`.radar-area-${d.sIndex}`)
            .transition()
            .duration(150)
            .style("fill-opacity", 0.7)
            .style("stroke-width", 3);

          d3.select(this)
            .interrupt()
            .attr("r", 7)
            .style("filter", theme === "light" ? "var(--chart-point-shadow)" : "drop-shadow(0 0 4px white)");

          tooltip.selectAll("*").remove();
          tooltip.append("strong").text(d.seriesName);
          tooltip.append("span").text(`${d.label}: ${d.value}`);
          positionTooltip(event);
          tooltip.style("opacity", 1).attr("aria-hidden", "false");
        })
        .on("mousemove", function (event) {
          positionTooltip(event);
        })
        .on("mouseleave", resetPointHover);
    });
    // === функции подсветки ===
    const brightenColor = (color: string, percent: number) => {
      const c = d3.hsl(color);
      c.l = Math.min(1, c.l + c.l * (percent / 200));
      return c.formatHsl();
    };
    const brightenBg = (percent: number) => {
      if (theme === "light") return "var(--ui-accent-background-hover)";
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue('--grid-color')
        .trim();

      const c = d3.hsl(bg);
      c.l = Math.min(1, c.l - c.l * (percent / 50));
      return c.formatHsl();
    };
    const toggleSeries = (
      i: number,
      row: d3.Selection<SVGGElement, unknown, null, undefined>
    ) => {
      resetPointHover();
      const enabled = seriesEnabled.get(i)!;
      seriesEnabled.set(i, !enabled);
      enabledRef.current.set(data[i].seriesName, !enabled);
      row.attr("aria-pressed", String(!enabled));

      maxValue = getVisibleRadarMaximum(data, seriesEnabled);
      rScale.domain([0, maxValue]);
      updateCaption();
      mainGroup.selectAll<SVGCircleElement, number>(".grid-circle")
        .data(d3.range(1, 6).map((level) => maxValue / 5 * level))
        .attr("r", (value) => rScale(value));
      data.forEach((series, index) => {
        // The departing series fades at its old coordinates; rescaling it would make it expand beyond the plot.
        if (!seriesEnabled.get(index)) return;
        const coords = series.values.map((value, axis) => angleToCoords(angleSlice * axis, value));
        const area = mainGroup.select<SVGPathElement>(`.radar-area-${index}`).interrupt("scale").datum(coords);
        const points = mainGroup.selectAll<SVGCircleElement, unknown>(`.point-${index}`).interrupt("scale");
        if (index === i) {
          area.attr("d", radarLine);
          points.attr("cx", (_, axis) => coords[axis].x).attr("cy", (_, axis) => coords[axis].y);
        } else {
          area.transition("scale").duration(200).attr("d", radarLine);
          points.transition("scale").duration(200).attr("cx", (_, axis) => coords[axis].x).attr("cy", (_, axis) => coords[axis].y);
        }
      });
      tooltip.style("opacity", 0);

      // показать / скрыть серию
      mainGroup
        .select(`.series-${i}`)
        .interrupt()
        .transition()
        .duration(200)
        .style("opacity", enabled ? 0 : 1)
        .style("pointer-events", enabled ? "none" : "all");

      // квадратик легенды
      row.select("rect.legend-color")
        .transition()
        .duration(200)
        .style("fill", enabled ? "transparent" : getSeriesColor(i, data.length, colorMode))
        .style("stroke", getSeriesColor(i, data.length, colorMode))
        .style("stroke-width", enabled ? 1.5 : 0);

      // приглушить текст
      row.select("text.legend-name")
        .transition()
        .duration(200)
        .style("opacity", enabled ? 0.5 : 1);

      // убрать подписи значений
      labelsGroup.selectAll("*").remove();
      const remaining = getEnabledSeries();
      if (remaining.length === 1) drawValueLabels(remaining[0], getSeriesColor(remaining[0], data.length, colorMode));
    };
    // === ЛЕГЕНДА ===
    const legend = svg.append("g").attr("class", "radar-legend")
      .attr("transform", compactLegend ? "translate(0, 4)" : `translate(${width - 130}, 20)`);
    // увеличение яркости цвета фона (var(--grid-color))
    const drawValueLabels = (i: number, color: string) => {
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
          .style("fill", theme === "light" ? "var(--text-color)" : color)
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
    };
    const getEnabledSeries = () =>
      Array.from(seriesEnabled.entries())
        .filter(([, enabled]) => enabled)
        .map(([i]) => i);
    data.forEach((series, i) => {
      const color = getSeriesColor(i, data.length, colorMode);
      const brightColor = theme === "light" ? color : brightenColor(color, 30);
      const y = 0;

      const row = legend.append("g")
        .attr("class", `legend-item legend-${i}`)
        .attr("transform", compactLegend ? `translate(${i % 2 * width / 2}, ${Math.floor(i / 2) * 28})` : `translate(0, ${i * 24})`)
        .attr("role", "button").attr("tabindex", 0)
        .attr("aria-label", series.seriesName).attr("aria-pressed", String(seriesEnabled.get(i)))
        .style("cursor", "pointer")
        .on("keydown", (event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleSeries(i, row); }
        })
        .on("click", () => {

          toggleSeries(i, row); mainGroup
            .selectAll(".axis-line")
            .transition()
            .duration(150)
            .style("stroke", "var(--radar-axis-stroke)")
            .style("stroke-width", 1);

        })
        .on("mouseenter", () => {
          if (!seriesEnabled.get(i)) return;

          // поднять слой серии
          mainGroup.select(`.series-${i}`).raise();
          mainGroup.selectAll(".grid-circle, .axis-line").raise();

          // фон строки легенды
          row.select("rect.legend-bg")
            .transition().duration(150)
            .style("fill", brightenBg(60));

          // подсветка области
          mainGroup
            .select(`.radar-area-${i}`)
            .transition()
            .duration(150)
            .style("fill-opacity", 0.7)
            .style("stroke-width", 3);

          // подсветка осей
          mainGroup
            .selectAll(".axis-line")
            .transition()
            .duration(150)
            .style("stroke-width", 3)
            .style("stroke", brightColor);

          // подсветка квадрата и текста в легенде
          row.select("rect.legend-color")
            .transition().duration(150)
            .style("fill", brightColor);

          row.select("text.legend-name")
            .transition().duration(150)
            .style("fill", theme === "light" ? "var(--text-color)" : brightColor);

          // показать временные подписи значений этой серии
          drawValueLabels(i, brightColor);
        })
        .on("mouseleave", () => {
          if (!seriesEnabled.get(i)) return;

          // вернуть фон строки легенды
          row.select("rect.legend-bg")
            .transition().duration(150)
            .style("fill", "var(--grid-color)");

          // убрать подсветку области
          mainGroup
            .select(`.radar-area-${i}`)
            .transition()
            .duration(150)
            .style("fill-opacity", 0.35)
            .style("stroke-width", 2);

          // вернуть стандартный цвет осей
          mainGroup
            .selectAll(".axis-line")
            .transition()
            .duration(150)
            .style("stroke", "var(--radar-axis-stroke)")
            .style("stroke-width", 1);

          // вернуть обычный цвет квадрата и текста
          row.select("rect.legend-color")
            .transition().duration(150)
            .style("fill", getSeriesColor(i, data.length, colorMode));

          row.select("text.legend-name")
            .transition().duration(150)
            .style("fill", theme === "light" ? "var(--text-color)" : getSeriesColor(i, data.length, colorMode));

          // удалить временные подписи значений
          const enabled = getEnabledSeries();
          labelsGroup.selectAll("*").remove();

          // если осталась одна активная серия — показать её подписи
          if (enabled.length === 1) {
            const idx = enabled[0];
            drawValueLabels(
              idx,
              getSeriesColor(idx, data.length, colorMode)
            );
          }
        });



      // элемент легенды: фон строки
      row
        .append("rect")
        .attr("class", "legend-bg")
        .attr("x", 8)
        .attr("y", y - 2)
        .attr("width", compactLegend ? width / 2 - 16 : 114)
        .attr("height", compactLegend ? 24 : 22)
        .style("fill", "var(--grid-color)")
        .style("opacity", 0.9)
        .style("stroke", "var(--text-color)")
        .style("stroke-width", 1)
        .style("stroke-opacity", 0.2)
        .style("rx", 4)
        .style("ry", 4);

      // квадратик цвета
      row
        .append("rect")
        .attr("class", "legend-color")
        .attr("x", 14)
        .attr("y", y + 4)
        .attr("width", 12)
        .attr("height", 12)
        .style("fill", seriesEnabled.get(i) ? color : "transparent")
        .style("stroke", color).style("stroke-width", seriesEnabled.get(i) ? 0 : 1.5);

      // название серии
      row
        .append("text")
        .attr("class", "legend-name")
        .attr("x", 32)
        .attr("y", y + 15)
        .style("font-size", "12px")
        .style("fill", theme === "light" ? "var(--text-color)" : color)
        .style("opacity", seriesEnabled.get(i) ? 1 : .5)
        .style("user-select", "none")
        .text(series.seriesName);
    });

    mainGroup.selectAll(".grid-circle, .axis-line").raise();
    labelsGroup.raise();
    const initiallyEnabled = getEnabledSeries();
    if (initiallyEnabled.length === 1) drawValueLabels(initiallyEnabled[0], getSeriesColor(initiallyEnabled[0], data.length, colorMode));
    return () => {
      svg.on(".radar", null);
      svg.selectAll("*").interrupt().interrupt("scale");
      tooltip.remove();
    };
  }, [labels, data, size, colorMode, theme, compactLegend, clipId]);

  return (
    <div ref={containerRef} className={styles.chartContainer} style={{ position: "relative" }}>
      <svg ref={svgRef} />
    </div>
  );
}
