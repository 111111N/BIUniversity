let pendingWrite: Promise<unknown> = Promise.resolve();
const LOCK_NAME = "bi-university-administration-write";

/** Account type changes and timetable publication share invariants, so they use one local write boundary. */
export const executeAdministrationWrite = <T,>(operation: () => T | Promise<T>): Promise<T> => {
  const run = async (): Promise<T> => {
    if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request(LOCK_NAME, operation);
    return await operation();
  };
  const result = pendingWrite.then(run, run);
  pendingWrite = result.catch(() => undefined);
  return result;
};
