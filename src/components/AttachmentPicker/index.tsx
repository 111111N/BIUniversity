import { useId, useRef, useState, type ChangeEvent } from "react";
import { formatFileSize, getAttachmentError } from "../../domain/files";
import ArrowIcon from "../ArrowIcon";
import styles from "./index.module.scss";

interface Props {
  label: string;
  file: File | null;
  onChange(file: File | null): void;
  retainedName?: string;
  disabled?: boolean;
}

const AttachmentPicker = ({ label, file, onChange, retainedName, disabled = false }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const [error, setError] = useState("");
  const select = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    const message = getAttachmentError(selected);
    setError(message);
    if (!message) onChange(selected);
  };

  return <div className={styles.picker}>
    <div className={styles.heading}><strong>{label}</strong><span>Необязательно · до 25 МБ</span></div>
    <div className={styles.controls}>
      <button type="button" disabled={disabled} aria-describedby={helpId} onClick={() => inputRef.current?.click()}><ArrowIcon direction="up" size={16} />{file || retainedName ? "Заменить файл" : "Прикрепить файл"}</button>
      {file && <button type="button" disabled={disabled} onClick={() => { onChange(null); setError(""); }}>Убрать выбранный файл</button>}
    </div>
    <input ref={inputRef} type="file" hidden disabled={disabled} aria-label={label} onChange={select} />
    <span id={helpId} className={styles.filename}>{file ? `${file.name} · ${formatFileSize(file.size)}` : retainedName ? `Текущее вложение: ${retainedName}` : "PDF, документы, изображения или архив"}</span>
    {file && retainedName && <small>Текущее вложение будет заменено после сохранения.</small>}
    {!file && retainedName && <small>Без замены сохранится текущий файл.</small>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
};

export default AttachmentPicker;
