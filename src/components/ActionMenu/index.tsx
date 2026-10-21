import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./index.module.scss";

interface Action { label: string; danger?: boolean; run(): void }
interface Props { id: string; label: string; x: number; y: number; actions: Action[]; onClose(): void; returnFocus(): void }

export default function ActionMenu({ id, label, x, y, actions, onClose, returnFocus }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const box = menu.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(x, innerWidth - box.width - 8)), top: Math.max(8, Math.min(y, innerHeight - box.height - 8)) });
    menu.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) closeRef.current(); };
    const close = () => closeRef.current();
    const scroll = (event: Event) => { if (!menu.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", close); window.removeEventListener("scroll", scroll, true); };
  }, [x, y]);

  return createPortal(<div ref={ref} id={id} className={styles.menu} style={position} role="menu" tabIndex={-1} aria-label={label} data-no-drag onKeyDown={(event) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.stopPropagation();
      if (event.key === "Escape") event.preventDefault();
      onClose(); returnFocus(); return;
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}>{actions.map((action) => <button key={action.label} type="button" role="menuitem" tabIndex={-1} className={action.danger ? styles.danger : undefined} onClick={() => { onClose(); returnFocus(); action.run(); }}>{action.label}</button>)}</div>, document.body);
}
