export const getTimeWheelDirection = (deltaY: number, deltaX: number, ctrlKey: boolean) =>
  ctrlKey || !Number.isFinite(deltaY) || deltaY === 0 || Math.abs(deltaX) > Math.abs(deltaY) ? 0 : Math.sign(deltaY);
