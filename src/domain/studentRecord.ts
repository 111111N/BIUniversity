export type StudentRecord = { number: string; year: number; campus: number; sequence: number; issuedAt: string };
export type StudentNumberPreview = Omit<StudentRecord, "issuedAt"> & { revision: number };
type NumberState = { revision: number; accounts: Array<{ studentRecord?: StudentRecord }>; studentNumberCounters?: Record<string, number> };

export const CAMPUSES = Array.from({ length: 9 }, (_, index) => ({ value: String(index + 1), label: `Корпус ${index + 1}` }));
export const getStudentNumberYear = (date: string) => {
  if (!Number.isFinite(Date.parse(date))) throw new Error("Не удалось определить год выдачи зачетки.");
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Moscow", year: "numeric" }).format(new Date(date)));
};
export const previewStudentNumber = (state: NumberState, campus: number, date: string): StudentNumberPreview => {
  if (!Number.isInteger(campus) || campus < 1 || campus > 9) throw new Error("Выберите корпус от 1 до 9.");
  const year = getStudentNumberYear(date);
  let last = state.studentNumberCounters?.[`${year}:${campus}`] ?? 0;
  for (const { studentRecord } of state.accounts) if (studentRecord?.year === year && studentRecord.campus === campus) last = Math.max(last, studentRecord.sequence);
  if (last >= 9999) throw new Error(`В корпусе ${campus} исчерпаны номера зачеток за ${year} год.`);
  const sequence = last + 1;
  return { number: `${year}${campus}${String(sequence).padStart(4, "0")}`, year, campus, sequence, revision: state.revision };
};
export const allocateStudentNumber = (state: NumberState, campus: number | undefined, expectedNumber: string | undefined, date: string) => {
  const preview = previewStudentNumber(state, campus ?? 0, date);
  if (expectedNumber !== preview.number) throw new Error("Номер зачетки изменился. Проверьте новый номер и повторите создание.");
  const { revision: _revision, ...record } = preview;
  return { studentRecord: { ...record, issuedAt: date }, studentNumberCounters: { ...state.studentNumberCounters, [`${record.year}:${record.campus}`]: record.sequence } };
};
export const isStudentRecord = (value: unknown): value is StudentRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as StudentRecord;
  return Number.isInteger(record.year) && record.year >= 2000 && record.year <= 9999 && Number.isInteger(record.campus) && record.campus >= 1 && record.campus <= 9
    && Number.isInteger(record.sequence) && record.sequence >= 1 && record.sequence <= 9999
    && record.number === `${record.year}${record.campus}${String(record.sequence).padStart(4, "0")}` && typeof record.issuedAt === "string" && Number.isFinite(Date.parse(record.issuedAt));
};
