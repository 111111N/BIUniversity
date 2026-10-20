import { useEffect, useId, useRef, useState } from "react";
import type { SubmissionAttempt } from "../../../data/assignmentStore";
import { getAnswerDraftKey, readAnswerDraft, removeAnswerDraft, saveAnswerDraft } from "../../../data/answerDraftStore";
import { formatFileSize } from "../../../domain/files";
import useUnsavedChangesWarning from "../../../hooks/useUnsavedChangesWarning";
import AttachmentPicker from "../../AttachmentPicker";
import ArrowCircle from "../../ArrowCircle";
import styles from "./index.module.scss";

interface Props {
  studentId: string;
  assignmentId: string;
  assignmentVersion: string;
  attempt?: SubmissionAttempt;
  saving: boolean;
  onSend(text: string, file: File | null): Promise<boolean>;
}

const AnswerComposer = ({ studentId, assignmentId, assignmentVersion, attempt, saving, onSend }: Props) => {
  const headingId = useId();
  const textId = useId();
  const hintId = useId();
  const draftStatusId = useId();
  const previewId = useId();
  const draftKey = getAnswerDraftKey(studentId, assignmentId, attempt?.id);
  const [initial] = useState(() => readAnswerDraft(draftKey));
  const [text, setText] = useState(initial.draft?.text ?? attempt?.text ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [missingFile, setMissingFile] = useState(initial.draft?.fileName);
  const [draftError, setDraftError] = useState(initial.error);
  const [draftSaved, setDraftSaved] = useState(Boolean(initial.draft));
  const [previewing, setPreviewing] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<string | null>(null);
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLHeadingElement>(null);
  const sendLock = useRef(false);
  const hasLocalChanges = text !== (attempt?.text ?? "") || Boolean(file || missingFile);
  const busy = saving || sending;
  const conditionsChanged = previewing && previewVersion !== assignmentVersion;
  useUnsavedChangesWarning(hasLocalChanges && !submitted);
  useEffect(() => { if (previewing) previewRef.current?.focus(); }, [previewing]);

  const persist = (nextText: string, fileName?: string) => {
    const saved = saveAnswerDraft(draftKey, { text: nextText, fileName });
    setDraftSaved(saved);
    setDraftError(saved ? "" : "Текст сейчас только в форме. Браузер не разрешил сохранить черновик — скопируйте его перед уходом со страницы.");
    setSendError("");
  };
  const returnToEditing = () => { setPreviewing(false); requestAnimationFrame(() => textareaRef.current?.focus()); };
  const send = async () => {
    if (!previewing || conditionsChanged || busy || submitted || sendLock.current || !text.trim() || missingFile) return;
    sendLock.current = true;
    setSending(true);
    setSendError("");
    try {
      if (await onSend(text.trim(), file)) {
        setSubmitted(true);
        removeAnswerDraft(draftKey);
      }
      else { setSendError("Ответ не отправлен. Текст и выбранный файл остались в форме."); returnToEditing(); }
    } catch {
      setSendError("Ответ не отправлен. Текст и выбранный файл остались в форме — повторите попытку.");
      returnToEditing();
    } finally { sendLock.current = false; setSending(false); }
  };

  return <section className={styles.composer} aria-labelledby={headingId} aria-busy={busy}>
    <header className={styles.header}><div><span>Моя работа</span><h3 id={headingId}>{attempt ? "Исправленный ответ" : "Подготовить ответ"}</h3></div><span className={styles.step}>{previewing ? "2 · Проверка" : "1 · Подготовка"}</span></header>
    {attempt?.teacherComment && <div className={styles.feedback}><strong>Что нужно исправить</strong><p>{attempt.teacherComment}</p></div>}
    {submitted ? <p className={styles.success} role="status">Ответ отправлен преподавателю. Он появится в истории попыток.</p> : previewing ? <div className={styles.preview}>
      <h4 id={previewId} ref={previewRef} tabIndex={-1}>Проверьте перед отправкой</h4>
      <div className={styles.answerText} role="region" aria-labelledby={previewId} tabIndex={0}>{text.trim()}</div>
      <div className={styles.attachment}><span>Вложение</span><strong>{file ? `${file.name} · ${formatFileSize(file.size)}` : attempt?.attachmentName ?? "Без файла"}</strong></div>
      <p className={styles.hint}>После отправки изменить ответ можно только после возврата преподавателем на доработку.</p>
      {conditionsChanged && <p className={styles.error} role="alert">Преподаватель изменил условия или срок задания. Перечитайте их выше, вернитесь к редактированию и проверьте ответ заново. Текст сохранён в форме.</p>}
      <div className={styles.actions}><button type="button" disabled={busy} onClick={returnToEditing}>Редактировать</button><button type="button" disabled={busy || conditionsChanged} className={styles.primary} onClick={() => { void send(); }}>{busy ? "Отправляем…" : attempt ? "Отправить повторно" : "Отправить преподавателю"}<ArrowCircle /></button></div>
    </div> : <form onSubmit={(event) => { event.preventDefault(); if (text.trim() && !missingFile && !busy) { setPreviewVersion(assignmentVersion); setPreviewing(true); } }}>
      <label htmlFor={textId}>Текст ответа <span>Обязательно</span></label>
      <textarea id={textId} ref={textareaRef} required disabled={busy} aria-describedby={`${hintId} ${draftStatusId}`} placeholder="Решение, выводы или комментарий к приложенному файлу" value={text} onChange={(event) => { setText(event.target.value); persist(event.target.value, file?.name ?? missingFile); }} />
      <div id={draftStatusId} className={styles.draftStatus}><span>{draftError ? "Текст не сохранён в черновик" : draftSaved ? "Текст сохранён до закрытия вкладки" : "Черновик ещё не сохранён"}</span><span>{text.length.toLocaleString("ru-RU")} симв.</span></div>
      <AttachmentPicker label="Файл ответа" file={file} retainedName={attempt?.attachmentName} disabled={busy} onChange={(next) => { setFile(next); setMissingFile(undefined); persist(text, next?.name); }} />
      {file && <p className={styles.hint}>Файл выбран для отправки, но не сохраняется в черновике. После обновления страницы его нужно прикрепить заново.</p>}
      {missingFile && <div className={styles.fileReminder} role="status"><span>Прикрепите «{missingFile}» заново. В черновике сохранён только текст, не сам файл.</span><button type="button" disabled={busy} onClick={() => { setMissingFile(undefined); persist(text); }}>{attempt?.attachmentName ? "Оставить прежнее вложение" : "Продолжить без файла"}</button></div>}
      <div className={styles.actions}><span id={hintId} className={styles.hint}>Черновик виден только вам. Файл необязателен. Перед отправкой можно проверить ответ.</span><button type="submit" className={styles.primary} disabled={busy || !text.trim() || Boolean(missingFile)}>Проверить ответ<ArrowCircle /></button></div>
    </form>}
    {draftError && <p className={styles.error} role="alert">{draftError}</p>}
    {sendError && <p className={styles.error} role="alert">{sendError}</p>}
  </section>;
};

export default AnswerComposer;
