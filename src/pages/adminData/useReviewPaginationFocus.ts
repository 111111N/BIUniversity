import { useCallback, useLayoutEffect, useRef } from "react";
import { scheduleReviewListFocus } from "./reviewPaginationFocus";

export const useReviewPaginationFocus = (source: unknown) => {
  const pending = useRef<() => void>(() => {});
  const cancel = useCallback(() => { pending.current(); }, []);
  useLayoutEffect(() => cancel, [cancel, source]);

  const request = (button: HTMLButtonElement, list: HTMLElement | null) => {
    cancel();
    pending.current = scheduleReviewListFocus(button, list);
  };
  return { request, cancel };
};
