export const retryWithFocusRecovery = (button: HTMLButtonElement, target: HTMLElement | null, retry: () => void) => {
  const hadFocus = document.activeElement === button;
  retry();
  if (!hadFocus || !target) return;

  requestAnimationFrame(() => {
    if (button.isConnected || !target.isConnected) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
};
