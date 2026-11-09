export type BoardEdge = "left" | "right" | null;

export const getBoardScrollStep = (board: HTMLElement, explicitStep?: number): number => {
  if (explicitStep !== undefined) return explicitStep;
  const [first, second] = board.querySelectorAll<HTMLElement>(":scope > [data-date]");
  const distance = first && second ? Math.abs(second.getBoundingClientRect().left - first.getBoundingClientRect().left) : 0;
  return distance > 0 ? distance : board.clientWidth;
};

export const getBoardScrollDirections = (width: number, contentWidth: number, offset: number) => {
  const maximum = Math.max(0, contentWidth - width);
  const position = Math.min(maximum, Math.max(0, offset));
  return { left: width > 0 && position > 2, right: width > 0 && maximum - position > 2 };
};

export const getHoveredBoardEdge = (clientX: number, left: number, width: number, pointerType: string): BoardEdge => {
  if ((pointerType !== "mouse" && pointerType !== "pen") || width <= 0) return null;
  const position = clientX - left;
  if (position < 0 || position > width) return null;
  const edgeWidth = Math.min(72, width * .12);
  return position <= edgeWidth ? "left" : position >= width - edgeWidth ? "right" : null;
};
