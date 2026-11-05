import { parseCalendarDate } from "./calendar";

/** Check only route selectors; labels cannot identify saved lessons or prove access. */
export const inspectArchivedScheduleHref = (href: string): "outside" | "readable" | "ambiguous" => {
  const beforeHash = href.split("#", 1)[0]; const queryStart = beforeHash.indexOf("?");
  const path = queryStart < 0 ? beforeHash : beforeHash.slice(0, queryStart);
  if (path !== "/schedule") return path.startsWith("/schedule/") ? "ambiguous" : "outside";
  try {
    const values = new Map<string, string>();
    for (const item of (queryStart < 0 ? "" : beforeHash.slice(queryStart + 1)).split("&")) {
      const split = item.indexOf("=");
      const decode = (value: string) => decodeURIComponent(value.replaceAll("+", " "));
      const key = decode(split < 0 ? item : item.slice(0, split));
      if (!["date", "type", "query"].includes(key)) continue;
      if (values.has(key)) return "ambiguous";
      values.set(key, decode(split < 0 ? "" : item.slice(split + 1)));
    }
    if (values.has("date") && !parseCalendarDate(values.get("date")!)) return "ambiguous";
    if (values.has("type") || values.has("query")) {
      if (!["group", "auditory", "teacher"].includes(values.get("type") ?? "") || !values.get("query")?.trim()) return "ambiguous";
    }
    return "readable";
  } catch { return "ambiguous"; }
};
