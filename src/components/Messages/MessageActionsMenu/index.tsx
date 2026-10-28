import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MessageActionIcon from "../MessageActionIcon";
import styles from "./index.module.scss";

type Action = { id: "reply" | "copy" | "select" | "delete"; label: string; disabled?: boolean; run(): void };
interface Props { x: number; y: number; actions: Action[]; onClose(): void; returnFocus(): void }

export default function MessageActionsMenu({ x, y, actions, onClose, returnFocus }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const box = menu.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)) });
    (menu.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? menu).focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) closeRef.current(); };
    const close = () => closeRef.current();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [x, y]);

  return createPortal(<div ref={ref} className={styles.menu} style={position} role="menu" tabIndex={-1} aria-label="Действия с сообщением" onKeyDown={(event) => {
    if (event.key === "Escape" || event.key === "Tab") { event.stopPropagation(); if (event.key === "Escape") event.preventDefault(); onClose(); returnFocus(); return; }
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}>{actions.map((action) => <button key={action.id} type="button" role="menuitem" disabled={action.disabled} className={action.id === "delete" ? styles.danger : ""} onClick={() => { onClose(); returnFocus(); action.run(); }}><MessageActionIcon name={action.id} />{action.label}</button>)}</div>, document.body);
}
