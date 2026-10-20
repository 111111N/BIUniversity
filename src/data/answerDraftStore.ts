interface AnswerDraft { text: string; fileName?: string }
interface DraftState { draft?: AnswerDraft; error: string }

// Drafts stay in this tab and are isolated by student, assignment and attempt.
export const getAnswerDraftKey = (studentId: string, assignmentId: string, attemptId?: string) =>
  `bi-university-answer-draft:${JSON.stringify([studentId, assignmentId, attemptId ?? "first"])}`;

export const readAnswerDraft = (key: string): DraftState => {
  try {
    const saved = sessionStorage.getItem(key);
    if (!saved) return { error: "" };
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== "object" || !("text" in value) || typeof value.text !== "string" || ("fileName" in value && typeof value.fileName !== "string")) throw new Error("Invalid answer draft");
    return { draft: { text: value.text, fileName: "fileName" in value ? value.fileName as string : undefined }, error: "" };
  } catch {
    return { error: "Не удалось восстановить черновик из этой вкладки. Новый текст можно ввести и отправить вручную." };
  }
};

export const saveAnswerDraft = (key: string, draft: AnswerDraft) => {
  try { sessionStorage.setItem(key, JSON.stringify(draft)); return true; }
  catch { return false; }
};

export const removeAnswerDraft = (key: string) => {
  try { sessionStorage.removeItem(key); return true; }
  catch { return false; }
};
