export const createPlannerTaskFocusRequest = (root: HTMLElement, sourceWeek: string, targetWeek: string, dayKey: string, preferredIds: readonly string[], revealCompleted: boolean) => {
  const doc = root.ownerDocument; const origin = doc.activeElement;
  let pending = true;
  const ownsFocus = () => {
    const active = doc.activeElement;
    if (active === origin || (active === doc.body && !origin?.isConnected)) return true;
    const card = active?.closest<HTMLElement>("[data-planner-task]");
    return Boolean(card && root.contains(card) && preferredIds.includes(card.dataset.plannerTask ?? ""));
  };
  const cancel = () => {
    if (!pending) return;
    pending = false; clearTimeout(timer);
    doc.removeEventListener("focusin", onFocus, true);
    doc.removeEventListener("pointerdown", cancel, true); doc.removeEventListener("keydown", cancel, true);
    doc.defaultView?.removeEventListener("popstate", cancel); doc.defaultView?.removeEventListener("blur", cancel);
  };
  const onFocus = () => { if (!ownsFocus()) cancel(); };
  const timer = setTimeout(cancel, 1500);
  doc.addEventListener("focusin", onFocus, true);
  doc.addEventListener("pointerdown", cancel, true); doc.addEventListener("keydown", cancel, true);
  doc.defaultView?.addEventListener("popstate", cancel); doc.defaultView?.addEventListener("blur", cancel);
  return {
    cancel,
    apply(week: string) {
      if (!pending) return;
      if (!ownsFocus() || !root.isConnected || (week !== sourceWeek && week !== targetWeek)) { cancel(); return; }
      if (week !== targetWeek) return;
      cancel();
      try {
        const day = Array.from(root.querySelectorAll<HTMLElement>("[data-date]")).find((item) => item.dataset.date === dayKey);
        if (!day?.isConnected || !day.getClientRects().length || day.closest('[hidden], [inert], [aria-hidden="true"]')) return;
        if (revealCompleted) { const details = day.querySelector<HTMLDetailsElement>("details"); if (details) details.open = true; }
        const visible = (button: HTMLButtonElement) => button.isConnected && !button.disabled && button.getClientRects().length > 0 && !button.closest('[hidden], [inert], [aria-hidden="true"]');
        const toggles = Array.from(day.querySelectorAll<HTMLButtonElement>("[data-task-toggle]")).filter(visible);
        const preferred = preferredIds.map((id) => toggles.find((button) => button.dataset.taskToggle === id)).find(Boolean);
        const target = preferred ?? toggles[0] ?? Array.from(day.querySelectorAll<HTMLButtonElement>("button")).find(visible);
        if (!target?.isConnected) return;
        target.focus({ preventScroll: true }); target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      } catch (error) { console.error("Не удалось перейти к задаче планировщика:", error); }
    },
  };
};
