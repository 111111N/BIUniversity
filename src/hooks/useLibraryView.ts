import { useCallback, useLayoutEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { readFileFilters, readHistoryFilters, updateFileFilters, updateHistoryFilters, type FileFilters, type HistoryFilters } from "../domain/libraryNavigation";

function useLibraryView<Filters extends object>(read: (params: URLSearchParams) => Filters, update: (params: URLSearchParams, patch: Partial<Filters>) => URLSearchParams) {
  const [params, setParams] = useSearchParams();
  const latest = useRef({ params, setParams });
  useLayoutEffect(() => { latest.current = { params, setParams }; }, [params, setParams]);
  const change = useCallback((patch: Partial<Filters>) => {
    // Upload completion must preserve filters changed while the files were being saved.
    const current = latest.current;
    const next = update(current.params, patch);
    latest.current = { ...current, params: next };
    current.setParams(next, { replace: true });
  }, [update]);
  return { ...read(params), change };
}

export function useFileView() { return useLibraryView<FileFilters>(readFileFilters, updateFileFilters); }

export function useHistoryView() {
  return useLibraryView<HistoryFilters>(readHistoryFilters, updateHistoryFilters);
}
