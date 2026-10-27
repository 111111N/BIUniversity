import { MAX_STUDENT_BULK_TARGETS } from "../../domain/studentBulk";
export const getStudentPageSelection = (selected: ReadonlySet<string>, ids: string[]) => {
  const unique = [...new Set(ids)];
  const onPage = unique.filter((id) => selected.has(id)).length;
  const all = unique.length > 0 && onPage === unique.length;
  return { all, onPage, offPage: selected.size - onPage, canToggle: all || selected.size + unique.length - onPage <= MAX_STUDENT_BULK_TARGETS };
};
export const toggleStudentPageSelection = (selected: ReadonlySet<string>, ids: string[]) => {
  const state = getStudentPageSelection(selected, ids);
  const next = new Set(selected);
  if (!state.canToggle) return next;
  for (const id of ids) if (state.all) next.delete(id); else next.add(id);
  return next;
};
