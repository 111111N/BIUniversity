import { useState } from "react";
import ArrowIcon from "../ArrowIcon";
import styles from "./index.module.scss";

interface Props {
  name: string;
  onDownload(): void | Promise<void>;
  className?: string;
  compact?: boolean;
  errorMessage?: string;
}

const DownloadButton = ({ name, onDownload, className = "", compact = false, errorMessage = "Файл недоступен. Попробуйте ещё раз или попросите преподавателя загрузить его повторно." }: Props) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    setBusy(true);
    setError("");
    try { await onDownload(); }
    catch { setError(errorMessage); }
    finally { setBusy(false); }
  };
  return <div className={styles.wrapper}>
    <button type="button" disabled={busy} className={`${styles.button} ${className}`} aria-label={`Скачать файл ${name}`} aria-busy={busy} onClick={download}><ArrowIcon direction="down" size={16} /><span>{busy ? "Подготавливаем…" : compact ? "Скачать" : name}</span></button>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
};

export default DownloadButton;
