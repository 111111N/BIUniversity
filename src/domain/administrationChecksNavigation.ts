export const CHECKS_RETURN_PARAM = "checksReturn";
const CHECKS_PATH = "/admin/checks";
const LOCAL_ORIGIN = "https://portal.invalid";
const RESULT_PREFIX = "admin-check-";
const FILTERS = ["q", "kind", "level", "page"] as const;
const RECORD_PATHS = new Set(["/admin/accounts", "/admin/accounts/import", "/admin/subjects", "/admin/groups", "/admin/schedule"]);

export const getCheckResultId = (issueId: string) => `${RESULT_PREFIX}${issueId}`;
export const readCheckResultAnchor = (hash: string): string | null => {
  try {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    return hash.startsWith("#") && id.startsWith(RESULT_PREFIX) && id.length > RESULT_PREFIX.length ? id : null;
  } catch { return null; }
};

export const validateChecksReturn = (value: string | null): string | null => {
  if (!value || value.length > 8192 || value.includes("\\") || [...value].some((character) => character.charCodeAt(0) < 32) || !/^\/admin\/checks(?:[?#]|$)/.test(value)) return null;
  try {
    const url = new URL(value, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN || url.pathname !== CHECKS_PATH || (url.hash && !readCheckResultAnchor(url.hash))) return null;
    if ([...url.searchParams.keys()].some((key) => !FILTERS.some((allowed) => allowed === key) || url.searchParams.getAll(key).length !== 1)) return null;
    if (url.searchParams.has("page")) {
      const page = Number(url.searchParams.get("page"));
      if (!Number.isSafeInteger(page) || page < 1) return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
};

export const createChecksReturn = (search: string, actualPage: number, issueId: string): string => {
  const source = new URLSearchParams(search);
  const params = new URLSearchParams();
  for (const key of FILTERS) if (key !== "page" && source.has(key)) params.set(key, source.get(key)!);
  if (Number.isSafeInteger(actualPage) && actualPage > 1) params.set("page", String(actualPage));
  const query = params.toString();
  return `${CHECKS_PATH}${query ? `?${query}` : ""}#${encodeURIComponent(getCheckResultId(issueId))}`;
};

export const readChecksReturn = (pathname: string, search: string): string | null => {
  if (!RECORD_PATHS.has(pathname)) return null;
  const params = new URLSearchParams(search);
  return params.getAll(CHECKS_RETURN_PARAM).length === 1 ? validateChecksReturn(params.get(CHECKS_RETURN_PARAM)) : null;
};

export const withChecksReturn = (destination: string, returnTo: string | null): string => {
  const valid = validateChecksReturn(returnTo);
  if (!valid) return destination;
  try {
    const url = new URL(destination, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN || !RECORD_PATHS.has(url.pathname) || !destination.startsWith("/admin/")) return CHECKS_PATH;
    url.searchParams.set(CHECKS_RETURN_PARAM, valid);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return CHECKS_PATH; }
};

export const inheritChecksReturn = (destination: string, pathname: string, search: string): string => {
  const returnTo = readChecksReturn(pathname, search);
  if (!returnTo) return destination;
  try {
    const url = new URL(destination, LOCAL_ORIGIN);
    return url.origin === LOCAL_ORIGIN && destination.startsWith("/admin/") && RECORD_PATHS.has(url.pathname)
      ? withChecksReturn(destination, returnTo) : destination;
  } catch { return destination; }
};
