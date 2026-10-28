import { useEffect, useId, useRef, useState } from "react";
import { formatFileSize, getFilePreviewFormat } from "../../domain/files";
import DownloadButton from "../DownloadButton";
import Modal from "../Modal";
import styles from "./index.module.scss";

const TEXT_LIMIT = 128 * 1024;
interface Props { name: string; blob: Blob; onDownload(): void | Promise<void>; onClose(): void }

const FilePreview = ({ name, blob, onDownload, onClose }: Props) => {
  const headingId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const format = getFilePreviewFormat({ name, type: blob.type });
  const kind = format?.kind, mime = format?.mime;

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setLoading(true);
    setError("");
    setUrl("");
    setText("");
    const prepare = async () => {
      try {
        if (!kind || !mime) throw new Error("Этот формат не поддерживает встроенный просмотр. Скачайте файл, чтобы открыть его в подходящей программе.");
        if (kind === "text") {
          const content = await blob.slice(0, TEXT_LIMIT).text();
          if (active) setText(content);
        } else {
          if (kind === "pdf" && await blob.slice(0, 5).text() !== "%PDF-") throw new Error("Не удалось распознать PDF. Попробуйте скачать оригинал или попросите преподавателя проверить файл.");
          if (!active) return;
          objectUrl = URL.createObjectURL(new Blob([blob], { type: mime }));
          setUrl(objectUrl);
        }
      } catch (failure) {
        console.error("Не удалось подготовить просмотр материала:", failure);
        if (active) setError(failure instanceof Error ? failure.message : "Не удалось подготовить просмотр. Оригинал можно скачать.");
      } finally { if (active) setLoading(false); }
    };
    void prepare();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [blob, kind, mime]);

  return <Modal labelledBy={headingId} initialFocusRef={closeRef} className={styles.preview} onClose={onClose}>
    <header className={styles.header}><div><span>Просмотр материала</span><h2 id={headingId}>{name}</h2><p>{formatFileSize(blob.size)} · Файл из локального хранилища</p></div><button ref={closeRef} type="button" className={styles.close} aria-label="Закрыть просмотр" title="Закрыть · Esc" onClick={onClose}>×</button></header>
    <div className={styles.content}>
      {loading ? <p className={styles.state} role="status">Подготавливаем просмотр…</p> : error ? <p className={styles.state} role="alert">{error}</p> : kind === "text" ? <>
        {blob.size > TEXT_LIMIT && <p className={styles.hint}>Показаны первые {formatFileSize(TEXT_LIMIT)}. Полный текст доступен в оригинальном файле.</p>}
        <pre className={styles.text} role="region" tabIndex={0} aria-label="Содержимое текстового материала">{text || "Файл пуст"}</pre>
      </> : kind === "image" && url ? <img className={styles.image} src={url} alt={name} onError={() => setError("Изображение не удалось открыть. Попробуйте скачать оригинал.")} /> : kind === "pdf" && url ? <object className={styles.pdf} data={url} type="application/pdf" tabIndex={0} title={`PDF: ${name}`} aria-label={`PDF: ${name}`}><p className={styles.state}>Браузер не поддерживает встроенный просмотр PDF. Скачайте файл кнопкой ниже.</p></object> : null}
    </div>
    <footer className={styles.footer}><span>{kind === "pdf" ? "Если PDF не отображается, скачайте оригинал. Просмотр зависит от браузера." : kind === "text" ? "Текст показан без выполнения разметки, в кодировке UTF-8." : "Оригинал не изменяется при просмотре."}</span><DownloadButton name={name} compact onDownload={onDownload} /></footer>
  </Modal>;
};

export default FilePreview;
