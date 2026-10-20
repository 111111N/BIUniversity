import type { Student } from "../components/Attendance/data/students";

export class JournalDraftConflictError extends Error {}
const keysFor = (first: Record<string, unknown>, second: Record<string, unknown>) => new Set([...Object.keys(first), ...Object.keys(second)]);
const sameOrder = (first: string[], second: string[]) => first.length === second.length && first.every((id, index) => id === second[index]);

export const countJournalDraftChanges = (original: Student[], draft: Student[]) => {
  const before = new Map(original.map((student) => [student.id, student]));
  const afterIds = new Set(draft.map((student) => student.id));
  let count = original.filter((student) => !afterIds.has(student.id)).length;
  draft.forEach((student) => {
    const previous = before.get(student.id);
    if (!previous) { count += 1; return; }
    if (student.name !== previous.name) count += 1;
    keysFor(previous.attendance, student.attendance).forEach((key) => { if ((previous.attendance[key] ?? "unmarked") !== (student.attendance[key] ?? "unmarked")) count += 1; });
    keysFor(previous.grades, student.grades).forEach((key) => { if ((previous.grades[key] ?? null) !== (student.grades[key] ?? null)) count += 1; });
  });
  const beforeCommon = original.filter((student) => afterIds.has(student.id)).map((student) => student.id);
  const afterCommon = draft.filter((student) => before.has(student.id)).map((student) => student.id);
  return count + Number(!sameOrder(beforeCommon, afterCommon));
};

/** Only changed fields are applied. A stale draft never overwrites a conflicting saved cell. */
export const mergeJournalDraft = (original: Student[], draft: Student[], latest: Student[]): Student[] => {
  if (new Set(draft.map((student) => student.id)).size !== draft.length) throw new JournalDraftConflictError("В черновике повторяются ученики. Сохранение отменено.");
  if (draft.some((student) => !student.name.trim())) throw new JournalDraftConflictError("Укажите имя для каждого ученика перед сохранением.");
  const before = new Map(original.map((student) => [student.id, student]));
  const after = new Map(draft.map((student) => [student.id, student]));
  const current = new Map(latest.map((student) => [student.id, student]));
  const conflict = (name: string, field: string): never => { throw new JournalDraftConflictError(`Не удалось сохранить: ${field} для «${name}» уже изменены в другом месте. Ваш черновик оставлен открытым. Отмените эту правку или скопируйте её перед повторным открытием журнала.`); };

  original.forEach((student) => {
    if (after.has(student.id)) return;
    const saved = current.get(student.id);
    if (saved && countJournalDraftChanges([student], [saved]) > 0) conflict(student.name, "данные ученика");
    current.delete(student.id);
  });
  draft.forEach((student) => {
    const previous = before.get(student.id);
    const saved = current.get(student.id);
    if (!previous) {
      if (saved && countJournalDraftChanges([student], [saved]) > 0) conflict(student.name, "данные нового ученика");
      if (!saved) current.set(student.id, { ...student, attendance: { ...student.attendance }, grades: { ...student.grades } });
      return;
    }
    if (!saved) {
      if (countJournalDraftChanges([previous], [student]) > 0) conflict(student.name, "состав группы: ученик удалён, его данные");
      return;
    }
    const merged = { ...saved, attendance: { ...saved.attendance }, grades: { ...saved.grades } };
    if (student.name !== previous.name) {
      if (saved.name !== previous.name && saved.name !== student.name) conflict(previous.name, "имя и данные");
      merged.name = student.name.trim();
    }
    keysFor(previous.attendance, student.attendance).forEach((key) => {
      const oldValue = previous.attendance[key] ?? "unmarked", nextValue = student.attendance[key] ?? "unmarked", savedValue = saved.attendance[key] ?? "unmarked";
      if (oldValue === nextValue) return;
      if (savedValue !== oldValue && savedValue !== nextValue) conflict(student.name, "отметки посещаемости");
      merged.attendance[key] = nextValue;
    });
    keysFor(previous.grades, student.grades).forEach((key) => {
      const oldValue = previous.grades[key] ?? null, nextValue = student.grades[key] ?? null, savedValue = saved.grades[key] ?? null;
      if (oldValue === nextValue) return;
      if (savedValue !== oldValue && savedValue !== nextValue) conflict(student.name, "оценки");
      merged.grades[key] = nextValue;
    });
    current.set(student.id, merged);
  });
  const common = original.filter((student) => after.has(student.id) && current.has(student.id)).map((student) => student.id);
  const commonSet = new Set(common);
  const desiredOrder = draft.filter((student) => commonSet.has(student.id)).map((student) => student.id);
  const latestOrder = latest.filter((student) => commonSet.has(student.id)).map((student) => student.id);
  const reordered = !sameOrder(common, desiredOrder) || draft.some((student) => !before.has(student.id));
  if (reordered && !sameOrder(common, latestOrder) && !sameOrder(desiredOrder, latestOrder)) throw new JournalDraftConflictError("Порядок учеников уже изменён в другом месте. Черновик оставлен открытым; актуальный журнал не перезаписан.");
  const orderedIds = reordered ? draft.map((student) => student.id) : latest.map((student) => student.id);
  const result: Student[] = [];
  const included = new Set<string>();
  [...orderedIds, ...current.keys()].forEach((id) => { const student = current.get(id); if (student && !included.has(id)) { result.push(student); included.add(id); } });
  return result;
};
