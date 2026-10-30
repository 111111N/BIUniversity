export const scheduleReviewListFocus = (button: HTMLButtonElement, list: HTMLElement | null): (() => void) => {
  const doc = button.ownerDocument;
  if (!list || doc.activeElement !== button) return () => {};

  let pending = true;
  let frame: number;
  const cancel = () => {
    if (!pending) return;
    pending = false;
    cancelAnimationFrame(frame);
    doc.removeEventListener("focusin", onFocus, true);
    doc.removeEventListener("pointerdown", cancel, true);
    doc.removeEventListener("keydown", cancel, true);
  };
  const onFocus = () => {
    if (doc.activeElement !== button && !(button.disabled && doc.activeElement === doc.body)) cancel();
  };
  doc.addEventListener("focusin", onFocus, true);
  doc.addEventListener("pointerdown", cancel, true);
  doc.addEventListener("keydown", cancel, true);
  frame = requestAnimationFrame(() => {
    if (!pending) return;
    cancel();
    // На крайней странице браузер может сбросить фокус отключённой кнопки на body.
    const ownsFocus = doc.activeElement === button || (button.disabled && doc.activeElement === doc.body);
    if (!ownsFocus || !button.isConnected || !list.isConnected || !list.getClientRects().length || list.closest('[inert], [aria-hidden="true"]')) return;
    list.focus({ preventScroll: true });
    list.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  return cancel;
};
