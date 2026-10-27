export const getAssignmentChanges = (before: string[], after: string[]) => {
  const previous = new Set(before);
  const next = new Set(after);
  const added = [...next].filter((id) => !previous.has(id));
  const removed = [...previous].filter((id) => !next.has(id));
  return { added, removed, rows: [...added.map((id) => ({ id, kind: "added" as const })), ...removed.map((id) => ({ id, kind: "removed" as const }))] };
};
