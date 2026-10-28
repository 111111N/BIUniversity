import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Modal from "../../Modal";
import Notifications from "..";
import styles from "./index.module.scss";

interface Props {
  id: string;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onClose(): void;
}

const NotificationsPopup = ({ id, anchorRef, onClose }: Props) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mobile, setMobile] = useState(() => window.innerWidth <= 760);
  const [position, setPosition] = useState({ left: 12, top: 12, maxHeight: window.innerHeight - 24 });

  useLayoutEffect(() => {
    const update = () => {
      setMobile(window.innerWidth <= 760);
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(460, window.innerWidth - 24);
      const maxHeight = Math.min(640, window.innerHeight - 24);
      const left = rect.right + width + 24 <= window.innerWidth ? rect.right + 12 : rect.left - width - 12;
      setPosition({ left: Math.max(12, Math.min(left, window.innerWidth - width - 12)), top: Math.max(12, Math.min(rect.top, window.innerHeight - maxHeight - 12)), maxHeight });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (mobile) return;
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    closeRef.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!panel?.contains(event.target as Node) && !anchor?.contains(event.target as Node)) onCloseRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onCloseRef.current(); }
    };
    const focusOutside = (event: FocusEvent) => {
      if (!panel?.contains(event.target as Node) && !anchor?.contains(event.target as Node)) onCloseRef.current();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("focusin", focusOutside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("focusin", focusOutside);
      if (anchor?.isConnected && (panel?.contains(document.activeElement) || document.activeElement === document.body)) anchor.focus({ preventScroll: true });
    };
  }, [mobile, anchorRef]);

  const content = <><header className={styles.heading}><h2 id={`${id}-title`}>Уведомления</h2><button ref={closeRef} type="button" onClick={onClose} aria-label="Закрыть уведомления"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg></button></header><Notifications compact onNavigate={onClose} /></>;
  if (mobile) return <Modal labelledBy={`${id}-title`} onClose={onClose} initialFocusRef={closeRef} className={styles.mobilePanel}><div id={id} className={styles.mobileBody}>{content}</div></Modal>;
  return createPortal(<div id={id} ref={panelRef} role="dialog" aria-labelledby={`${id}-title`} className={styles.panel} style={position}>{content}</div>, document.body);
};

export default NotificationsPopup;
