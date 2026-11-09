import { useEffect, useState, type RefObject } from "react";
import ArrowButton from "../ArrowButton";
import { getBoardScrollDirections, getBoardScrollStep, getHoveredBoardEdge, type BoardEdge } from "./scrollState";
import styles from "./index.module.scss";

interface Props {
  boardRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  boardId: string;
  scopeKey: string;
  enabled?: boolean;
  step?: number;
}

const EdgeScrollControls = ({ boardRef, frameRef, boardId, scopeKey, enabled = true, step }: Props) => {
  const [directions, setDirections] = useState({ left: false, right: false });
  const [hoveredEdge, setHoveredEdge] = useState<BoardEdge>(null);

  useEffect(() => {
    const board = boardRef.current;
    const frame = frameRef.current;
    if (!enabled || !board || !frame) return;
    const update = () => {
      const next = getBoardScrollDirections(board.clientWidth, board.scrollWidth, board.scrollLeft);
      setDirections((current) => current.left === next.left && current.right === next.right ? current : next);
    };
    let hoverFrame: number | undefined;
    let pointerX = 0;
    let pointerType = "mouse";
    const hover = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerType = event.pointerType;
      if (hoverFrame !== undefined) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = undefined;
        const bounds = frame.getBoundingClientRect();
        setHoveredEdge(getHoveredBoardEdge(pointerX, bounds.left, bounds.width, pointerType));
      });
    };
    const clearHover = () => {
      if (hoverFrame !== undefined) cancelAnimationFrame(hoverFrame);
      hoverFrame = undefined;
      setHoveredEdge(null);
    };
    update();
    clearHover();
    board.addEventListener("scroll", update, { passive: true });
    frame.addEventListener("pointermove", hover, { passive: true });
    frame.addEventListener("pointerleave", clearHover);
    window.addEventListener("resize", update);
    window.addEventListener("blur", clearHover);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(board);
    return () => {
      if (hoverFrame !== undefined) cancelAnimationFrame(hoverFrame);
      board.removeEventListener("scroll", update);
      frame.removeEventListener("pointermove", hover);
      frame.removeEventListener("pointerleave", clearHover);
      window.removeEventListener("resize", update);
      window.removeEventListener("blur", clearHover);
      observer?.disconnect();
    };
  }, [boardRef, frameRef, scopeKey, enabled]);

  const move = (direction: -1 | 1) => {
    const board = boardRef.current;
    if (!board) return;
    try {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      board.scrollBy({ left: getBoardScrollStep(board, step) * direction, behavior: reducedMotion ? "auto" : "smooth" });
    } catch (error) { console.error("Не удалось прокрутить область по горизонтали:", error); }
  };

  return <div className={styles.controls}>
    {(["left", "right"] as const).map((direction) => <div className={`${styles.edge} ${styles[direction]}`} key={direction}>
      <ArrowButton className={styles.edgeButton} direction={direction} label={direction === "left" ? "Предыдущие дни" : "Следующие дни"} aria-controls={boardId} disabled={!enabled || !directions[direction]} data-revealed={enabled && hoveredEdge === direction && directions[direction] ? "true" : undefined} onClick={() => move(direction === "left" ? -1 : 1)} />
    </div>)}
  </div>;
};

export default EdgeScrollControls;
