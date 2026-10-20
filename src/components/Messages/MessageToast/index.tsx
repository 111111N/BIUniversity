import { useEffect, useRef } from "react";
import MessageActionIcon from "../MessageActionIcon";
import styles from "./index.module.scss";

export default function MessageToast({ text, error = false, onClose }: { text: string; error?: boolean; onClose(): void }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (error) return;
    const timer = window.setTimeout(() => closeRef.current(), 2800);
    return () => window.clearTimeout(timer);
  }, [text, error]);
  return <div className={`${styles.toast} ${error ? styles.error : ""}`} role={error ? "alert" : "status"}><span>{text}</span><button type="button" onClick={onClose} aria-label="Скрыть уведомление"><MessageActionIcon name="close" /></button></div>;
}
