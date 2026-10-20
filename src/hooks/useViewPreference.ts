import { useState } from "react";

// Preferences are optional: unavailable browser storage must never block a view change.
const useViewPreference = <T extends string>(key: string, options: readonly T[], fallback: T) => {
  const read = (): T => {
    try {
      const saved = localStorage.getItem(key);
      return options.find((option) => option === saved) ?? fallback;
    } catch { return fallback; }
  };
  const [preference, setPreference] = useState(() => ({ key, value: read() }));
  const value = preference.key === key ? preference.value : read();
  const changeView = (next: T) => {
    if (!options.includes(next)) return;
    setPreference({ key, value: next });
    try { localStorage.setItem(key, next); } catch { /* Keep the selected view for this visit. */ }
  };
  return [value, changeView] as const;
};

export default useViewPreference;
