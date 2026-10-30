export const focusScheduleSearch = (trigger: HTMLButtonElement | null, panel: HTMLElement | null): boolean => {
  try {
    if (!trigger?.isConnected || trigger.disabled || !panel?.isConnected || trigger.ownerDocument.activeElement !== trigger) return false;
    const input = panel.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input?.isConnected || input.disabled || !input.getClientRects().length || input.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    // Выполняется после раскрытия панели, без отложенного фокуса после следующего действия пользователя.
    input.focus();
    return trigger.ownerDocument.activeElement === input;
  } catch (error) {
    console.error("Не удалось перейти к поиску расписания:", error);
    return false;
  }
};
