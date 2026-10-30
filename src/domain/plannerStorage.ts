export const PLANNER_STORAGE_KEY = "bi-university-demo-planner";
export const LEGACY_PLANNER_OWNER_ID = "teacher-elena-volkova";
export const getPlannerStorageKey = (userId: string) => userId === LEGACY_PLANNER_OWNER_ID ? PLANNER_STORAGE_KEY : `${PLANNER_STORAGE_KEY}:${encodeURIComponent(userId)}`;

/** Accept only keys the current writer produces; aliases must never merge private lists. */
export const getPlannerStorageOwner = (key: string): string | undefined => {
  if (key === PLANNER_STORAGE_KEY) return LEGACY_PLANNER_OWNER_ID;
  if (!key.startsWith(`${PLANNER_STORAGE_KEY}:`)) return;
  try {
    const owner = decodeURIComponent(key.slice(PLANNER_STORAGE_KEY.length + 1));
    if (owner.trim() && getPlannerStorageKey(owner) === key) return owner;
  } catch { return; }
};
