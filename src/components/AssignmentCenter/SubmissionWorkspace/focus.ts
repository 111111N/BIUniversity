export interface SubmissionFocusState {
  currentId: string | null;
  answerOpen: boolean;
  unavailable: boolean;
  missingMode: boolean;
}

type DetailFocusIntent = "open" | "replacement" | "revealed";
export type SubmissionFocusIntent = "list" | DetailFocusIntent | null;

export const getSubmissionFocusIntent = (previous: SubmissionFocusState | null, current: SubmissionFocusState): SubmissionFocusIntent => {
  if (current.missingMode) return null;
  if (previous?.answerOpen && !current.answerOpen) return "list";
  if (!current.answerOpen || !current.currentId) return null;
  if (!previous || previous.currentId !== current.currentId || !previous.answerOpen) return "open";
  if (previous.missingMode) return "revealed";
  if (previous.unavailable !== current.unavailable) return "replacement";
  // Effect setup can repeat after cleanup in StrictMode; replay a cancelled opening.
  return "open";
};

export const focusSubmissionDetail = (detail: HTMLElement | null, target: HTMLElement | null, intent: DetailFocusIntent, mobile: boolean) => {
  if (!detail || !target || (intent === "revealed" && !mobile)) return;
  const active = document.activeElement;
  // URL updates while typing must preserve both caret and reading position.
  if (active && detail.contains(active)) return;
  if (intent === "replacement" && active && active !== document.body) return;
  target.focus({ preventScroll: true });
  if (mobile) detail.scrollIntoView({ block: "start" });
};
