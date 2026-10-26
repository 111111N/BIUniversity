export interface StudentImportReceipt {
  id: string;
  fingerprint: string;
  actorId: string;
  createdAt: string;
  sourceRowCount: number;
  created: Array<{ line: number; accountId: string; studentNumber: string }>;
  skipped: Array<{ line: number; accountId: string }>;
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const isStudentImportReceipt = (value: unknown): value is StudentImportReceipt => {
  if (!record(value) || typeof value.id !== "string" || !value.id.trim() || value.id.length > 120 || typeof value.actorId !== "string" || !value.actorId.trim() || typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.fingerprint) || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isSafeInteger(value.sourceRowCount) || Number(value.sourceRowCount) < 1 || !Array.isArray(value.created) || !value.created.length || !Array.isArray(value.skipped)) return false;
  const rows = [...value.created, ...value.skipped];
  return rows.length === value.sourceRowCount && rows.every((row) => record(row) && Number.isSafeInteger(row.line) && Number(row.line) > 0 && typeof row.accountId === "string" && Boolean(row.accountId.trim()))
    && value.created.every((row) => typeof row.studentNumber === "string" && /^[2-9][0-9]{3}[1-9][0-9]{4}$/.test(row.studentNumber))
    && new Set(rows.map((row) => row.line)).size === rows.length && new Set(rows.map((row) => row.accountId)).size === rows.length;
};
