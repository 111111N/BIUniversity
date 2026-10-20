import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { acquireBodyScrollLock } from "../../hooks/useBodyScrollLock";
import styles from "./index.module.scss";

interface ActiveModal { element: HTMLDivElement; layer: number }
const activeModals: ActiveModal[] = [];
let outsideFocus: HTMLElement | null = null;
const focusableSelector = 'button, input, textarea, select, a[href], iframe, [tabindex]';
const getFocusable = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLElement>(focusableSelector))
  .filter((item) => !item.matches(":disabled") && item.tabIndex >= 0 && !item.closest('[inert], [aria-hidden="true"]') && item.getClientRects().length > 0);
const getTopModal = () => activeModals.reduce<ActiveModal | undefined>((top, modal) => !top || modal.layer >= top.layer ? modal : top, undefined);

interface ModalProps {
  children: ReactNode;
  labelledBy: string;
  onClose(): void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  layer?: number;
}

const Modal = ({ children, labelledBy, onClose, initialFocusRef, className = "", layer }: ModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const releaseScrollLock = acquireBodyScrollLock();
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!activeModals.length) {
      outsideFocus = previousFocus;
    }
    const modal = { element: dialog, layer: layer ?? 1000 };
    activeModals.push(modal);
    if (getTopModal() === modal) {
      const focusable = getFocusable(dialog);
      const preferred = initialFocusRef?.current;
      (preferred && focusable.includes(preferred) ? preferred : focusable[0] ?? dialog).focus({ preventScroll: true });
    }

    return () => {
      const wasTop = getTopModal() === modal;
      const index = activeModals.indexOf(modal);
      if (index !== -1) activeModals.splice(index, 1);
      releaseScrollLock();
      const next = getTopModal();
      if (!next) {
        const restore = previousFocus?.isConnected ? previousFocus : outsideFocus;
        outsideFocus = null;
        if (restore?.isConnected) restore.focus({ preventScroll: true });
      } else if (wasTop) {
        const restore = previousFocus?.isConnected && next.element.contains(previousFocus) ? previousFocus : getFocusable(next.element)[0] ?? next.element;
        restore.focus({ preventScroll: true });
      }
    };
  }, [initialFocusRef, layer]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Portalled calendars and dropdowns manage their own focus and Escape.
    if (event.defaultPrevented || getTopModal()?.element !== dialogRef.current || !event.currentTarget.contains(event.target as Node)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current ? getFocusable(dialogRef.current) : [];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first) { event.preventDefault(); dialogRef.current?.focus(); return; }
    if (!focusable.includes(document.activeElement as HTMLElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return createPortal(
    <div className={styles.overlay} style={layer === undefined ? undefined : { zIndex: layer }} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && getTopModal()?.element === dialogRef.current) onClose(); }}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- The dialog contains keyboard focus and handles Escape. */}
      <div ref={dialogRef} tabIndex={-1} className={`${styles.dialog} ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} onKeyDown={handleKeyDown}>
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
