export interface ScrollArea { key: string; top: number; left: number }
export interface ProfileOrigin { to: string; label: string; scrollY: number; scrollAreas?: ScrollArea[] }

export const profileOriginLabel = (pathname: string) => {
  if (pathname.startsWith("/messages")) return "Назад к сообщениям";
  if (pathname.startsWith("/stats")) return "Назад к статистике";
  if (pathname.startsWith("/journal")) return "Назад к журналу";
  return "Назад в кабинет";
};

export const getProfileOrigin = (state: unknown, fallback: string): ProfileOrigin => {
  const defaultOrigin = { to: fallback, label: profileOriginLabel(fallback), scrollY: 0 };
  if (!state || typeof state !== "object" || !("profileOrigin" in state)) return defaultOrigin;
  const origin = state.profileOrigin;
  if (!origin || typeof origin !== "object" || !("to" in origin) || typeof origin.to !== "string") return defaultOrigin;
  // Only known internal working areas can be used as a return destination.
  if (!/^\/(cabinet|journal|stats|messages)(\/|\?|#|$)/.test(origin.to) || origin.to.includes("\\") || [...origin.to].some((character) => character.charCodeAt(0) < 32)) return defaultOrigin;
  const areas = "scrollAreas" in origin && Array.isArray(origin.scrollAreas) ? origin.scrollAreas.filter((area): area is ScrollArea => Boolean(area && typeof area.key === "string" && typeof area.top === "number" && typeof area.left === "number" && Number.isFinite(area.top) && Number.isFinite(area.left))).slice(0, 10) : [];
  return { to: origin.to, label: profileOriginLabel(origin.to), scrollY: "scrollY" in origin && typeof origin.scrollY === "number" && Number.isFinite(origin.scrollY) ? Math.max(0, origin.scrollY) : 0, ...(areas.length ? { scrollAreas: areas } : {}) };
};
