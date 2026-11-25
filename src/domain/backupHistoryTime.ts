/** Current writers persist exact UTC instants; legacy dates must not become inferred midnight timestamps. */
export const isCanonicalBackupInstant = (value: string) => {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
};
