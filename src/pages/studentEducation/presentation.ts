import type { StudentEducationEvent } from "../../domain/studentEducationEvent";

export { hasEducationDetailsChanges as hasAdmissionChanges } from "../../components/EducationEventFields/presentation";

export type EducationSection = "events" | "periods" | "dated";
export const getEducationSection = (params: URLSearchParams, hash: string): EducationSection => hash ? "events" : params.get("view") === "periods" ? "periods" : params.get("view") === "dated" ? "dated" : "events";
export const educationSectionSearch = (current: URLSearchParams, section: EducationSection) => {
  const next = new URLSearchParams(current);
  if (section === "events") next.delete("view"); else next.set("view", section);
  return next;
};
export const getEducationTimeline = (events: StudentEducationEvent[], limit: number, hash: string) => {
  const linked = events.find((event) => `#${event.id}` === hash);
  const shown = events.slice(-limit).reverse();
  if (linked && !shown.some((event) => event.id === linked.id)) shown.push(linked);
  return { shown, linkedId: linked?.id, missingLinkedEvent: Boolean(hash && !linked), remaining: events.length - shown.length };
};
