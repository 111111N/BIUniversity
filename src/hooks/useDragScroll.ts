import { useEffect, useRef, useState, type DragEventHandler, type MouseEventHandler, type PointerEventHandler, type RefObject } from "react";

interface DragScrollOptions {
  axis?: "x" | "both";
  enabled?: boolean;
  resetKey?: string;
}

// Keep normal clicks and native touch scrolling; only take over a deliberate mouse drag.
const useDragScroll = (ref: RefObject<HTMLElement | null>, { axis = "x", enabled = true, resetKey }: DragScrollOptions = {}) => {
  const [dragging, setDragging] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const suppressClickUntil = useRef(0);

  useEffect(() => () => {
    stopRef.current();
    suppressClickUntil.current = 0;
  }, [axis, enabled, resetKey]);

  const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
    stopRef.current();
    suppressClickUntil.current = 0;
    const board = ref.current;
    if (!enabled || !board || event.pointerType !== "mouse" || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [data-no-drag]")) return;
    const bounds = board.getBoundingClientRect();
    const localX = event.clientX - bounds.left - board.clientLeft;
    const localY = event.clientY - bounds.top - board.clientTop;
    if (localX < 0 || localY < 0 || localX >= board.clientWidth || localY >= board.clientHeight) return;
    const canX = board.scrollWidth > board.clientWidth + 1;
    const canY = axis === "both" && board.scrollHeight > board.clientHeight + 1;
    if (!canX && !canY) return;

    const pointerId = event.pointerId;
    const startX = event.clientX, startY = event.clientY;
    const startLeft = board.scrollLeft, startTop = board.scrollTop;
    let active = false;
    let stopped = false;
    let restoreStyles: (() => void) | undefined;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", stop);
      if (board.hasPointerCapture?.(pointerId)) board.releasePointerCapture(pointerId);
      restoreStyles?.();
      if (active) {
        suppressClickUntil.current = Date.now() + 400;
        setDragging(false);
      }
      stopRef.current = () => {};
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      if (!(next.buttons & 1)) { stop(); return; }
      const dx = next.clientX - startX, dy = next.clientY - startY;
      if (!active) {
        if (Math.hypot(canX ? dx : 0, canY ? dy : 0) < 6) return;
        active = true;
        setDragging(true);
        const body = board.ownerDocument.body;
        const previousCursor = body.style.cursor, previousSelection = body.style.userSelect;
        body.style.cursor = "grabbing";
        body.style.userSelect = "none";
        restoreStyles = () => { body.style.cursor = previousCursor; body.style.userSelect = previousSelection; };
        const selection = board.ownerDocument.getSelection();
        if (selection?.anchorNode && board.contains(selection.anchorNode)) selection.removeAllRanges();
        try { board.setPointerCapture(pointerId); } catch { /* Window listeners still complete the drag. */ }
      }
      next.preventDefault();
      if (canX) board.scrollLeft = startLeft - dx;
      if (canY) board.scrollTop = startTop - dy;
    };
    const finish = (next: PointerEvent) => { if (next.pointerId === pointerId) stop(); };
    stopRef.current = stop;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", stop);
  };

  const onClickCapture: MouseEventHandler<HTMLElement> = (event) => {
    if (event.detail === 0 || Date.now() > suppressClickUntil.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickUntil.current = 0;
  };
  const onDragStartCapture: DragEventHandler<HTMLElement> = (event) => {
    if (enabled && event.target instanceof Element && !event.target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [data-no-drag]")) event.preventDefault();
  };

  return { dragging, onPointerDown, onClickCapture, onDragStartCapture };
};

export default useDragScroll;
