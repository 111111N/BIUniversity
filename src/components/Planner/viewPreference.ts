export type PlannerView = "board" | "list";

export const getPlannerView = (saved: string | null, narrow: boolean): PlannerView =>
  saved === "board" || saved === "list" ? saved : narrow ? "list" : "board";

export const readPlannerView = (key: string): PlannerView => {
  let saved: string | null = null;
  try { saved = localStorage.getItem(key); } catch { /* A stored preference is optional. */ }
  return getPlannerView(saved, typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 720px)").matches);
};
