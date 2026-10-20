import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { UserRole } from "../components/RoleContext";
import { getMessageDraftKey, readMessageDraft, removeMessageDraft, saveMessageDraft } from "../data/messageDraftStore";

interface DraftEntry { text: string; error: string; saved: boolean; operation: "read" | "save" | "remove"; sent?: boolean }
type DraftEntries = Record<string, DraftEntry>;

const useMessageDrafts = (role: UserRole, userId: string, dialogIds: string[], temporaryDialogId?: string) => {
  const owner = JSON.stringify([role, userId]);
  const idsKey = JSON.stringify([...new Set(dialogIds)]);
  const readEntry = useCallback((id: string): DraftEntry => {
    if (id === temporaryDialogId) return { text: "", error: "", saved: false, operation: "read" };
    const snapshot = readMessageDraft(getMessageDraftKey(role, userId, id));
    return { text: snapshot.text ?? "", error: snapshot.error, saved: !snapshot.error, operation: "read" };
  }, [role, userId, temporaryDialogId]);
  const [state, setState] = useState(() => ({ owner, entries: Object.fromEntries(dialogIds.map((id) => [id, readEntry(id)])) as DraftEntries }));
  const latest = useRef(state);
  const entries = state.owner === owner ? state.entries : {};
  useLayoutEffect(() => {
    const previous = latest.current.owner === owner ? latest.current.entries : {};
    const next = { ...previous };
    const ids: string[] = JSON.parse(idsKey);
    ids.forEach((id) => { if (!Object.hasOwn(next, id)) next[id] = readEntry(id); });
    if (latest.current.owner !== owner || ids.some((id) => !Object.hasOwn(previous, id))) {
      const updated = { owner, entries: next };
      latest.current = updated; setState(updated);
    }
  }, [owner, idsKey, readEntry]);

  const update = (id: string, entry: DraftEntry) => {
    const previous = latest.current.owner === owner ? latest.current.entries : {};
    const next = { owner, entries: { ...previous, [id]: entry } };
    latest.current = next; setState(next);
  };
  const changeDraft = (id: string, text: string) => {
    // Until the first message, a new group's identity and members exist only in memory.
    if (id === temporaryDialogId) { update(id, { text, error: "", saved: false, operation: "save" }); return; }
    const result = text ? saveMessageDraft(getMessageDraftKey(role, userId, id), text) : removeMessageDraft(getMessageDraftKey(role, userId, id));
    update(id, { text, error: result.error, saved: !result.error, operation: text ? "save" : "remove" });
  };
  const completeDraft = (id: string) => {
    if (id === temporaryDialogId) { update(id, { text: "", error: "", saved: true, operation: "remove", sent: true }); return; }
    const result = removeMessageDraft(getMessageDraftKey(role, userId, id));
    update(id, { text: "", error: result.error ? `Сообщение сохранено. ${result.error}` : "", saved: !result.error, operation: "remove", sent: true });
  };
  const retryDraft = (id: string) => {
    const entry = latest.current.owner === owner ? latest.current.entries[id] : undefined;
    if (!entry) return;
    if (entry.operation === "read") update(id, readEntry(id));
    else if (entry.operation === "save") changeDraft(id, entry.text);
    else if (entry.sent) completeDraft(id);
    else changeDraft(id, "");
  };
  const forgetDraft = (id: string) => {
    const previous = latest.current.owner === owner ? latest.current.entries : {};
    const nextEntries = { ...previous };
    delete nextEntries[id];
    const next = { owner, entries: nextEntries };
    latest.current = next; setState(next);
  };
  return {
    drafts: Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, entry.text])),
    errors: Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, entry.error])),
    saved: Object.fromEntries(Object.entries(entries).map(([id, entry]) => [id, entry.saved])),
    hasUnsavedText: Object.values(entries).some((entry) => Boolean(entry.text.trim()) && !entry.saved),
    changeDraft, completeDraft, retryDraft, forgetDraft,
  };
};

export default useMessageDrafts;
