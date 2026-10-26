const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ru-RU").replaceAll("ё", "е");

/** All words must match; name order, case and ё/е do not affect the result. */
export const matchesSearchText = (text: string, query: string) => {
  const value = normalize(text);
  return normalize(query).trim().split(/\s+/).filter(Boolean).every((word) => value.includes(word));
};

export interface SearchOption { label: string; searchText?: string }

export const matchesSearchOption = (option: SearchOption, query: string) =>
  matchesSearchText(`${option.label} ${option.searchText ?? ""}`, query);
