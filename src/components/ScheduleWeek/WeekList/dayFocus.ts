/** A day jump moves both the viewport and the keyboard reading position within this list. */
export const focusScheduleDay = (root: HTMLElement | null, day: string) => {
  if (!root?.isConnected) return false;
  try {
    const target = Array.from(root.querySelectorAll<HTMLElement>("[data-schedule-day]"))
      .find((element) => element.dataset.scheduleDay === day);
    if (!target?.isConnected || !target.getClientRects().length || target.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    target.scrollIntoView({ block: "start", behavior: "auto" });
    target.focus({ preventScroll: true });
    return true;
  } catch (error) {
    console.error("Не удалось перейти к выбранному дню расписания:", error);
    return false;
  }
};
