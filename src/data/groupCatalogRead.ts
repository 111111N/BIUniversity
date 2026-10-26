import { decodeGroupCatalog, emptyGroupCatalog, type GroupCatalogDocument } from "../domain/groupCatalog";

export const GROUP_CATALOG_STORAGE_KEY = "bi-university-group-catalog-v1";
export const GROUP_CATALOG_CHANGE_EVENT = "bi-university-group-catalog-change";
let cachedRaw: string | null | undefined;
let cachedDocument: GroupCatalogDocument | undefined;

export const readGroupCatalogDocument = (): GroupCatalogDocument => {
  const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(GROUP_CATALOG_STORAGE_KEY);
  if (cachedDocument && cachedRaw === raw) return cachedDocument;
  const document = raw === null ? emptyGroupCatalog() : decodeGroupCatalog(raw);
  cachedRaw = raw; cachedDocument = document;
  return document;
};
