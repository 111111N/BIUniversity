import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import styles from "./index.module.scss";

const OPEN_EVENT = "bi-university-tooltip-open";
interface Props { label: string; children: ReactElement<{ "aria-describedby"?: string }> }
const Tooltip = ({ label, children }: Props) => {
  const id = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!visible) return;
    const hide = () => setVisible(false);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    const hideForAnother = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) hide(); };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", escape);
    document.addEventListener(OPEN_EVENT, hideForAnother);
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); document.removeEventListener("keydown", escape); document.removeEventListener(OPEN_EVENT, hideForAnother); };
  }, [visible, id]);
  const show = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(240, window.innerWidth - 24);
    document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    setPosition({ left: Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12)), top: rect.bottom + 60 < window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - 52) });
    setVisible(true);
  };
  return <div className={styles.anchor} ref={anchorRef} onMouseEnter={show} onMouseLeave={() => { if (!anchorRef.current?.contains(document.activeElement)) setVisible(false); }} onFocus={show} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setVisible(false); }}>
    {cloneElement(children, { "aria-describedby": visible ? [children.props["aria-describedby"], id].filter(Boolean).join(" ") : children.props["aria-describedby"] })}
    {visible && createPortal(<div id={id} role="tooltip" className={styles.tooltip} style={position}>{label}</div>, document.body)}
  </div>;
};

export default Tooltip;
