import { useEffect, useId, useRef, useState } from "react";
import type { SubmissionAttempt } from "../../../data/assignmentStore";
import { getAnswerDraftKey, readAnswerDraft, removeAnswerDraft, saveAnswerDraft } from "../../../data/answerDraftStore";
import { formatFileSize } from "../../../domain/files";
import { getAssignmentAttachmentName } from "../../../domain/assignmentAttachments";
import useUnsavedChangesWarning from "../../../hooks/useUnsavedChangesWarning";
import { changesAssignmentAnswer } from "../../../domain/unsavedNavigation";
import AttachmentPicker from "../../AttachmentPicker";
import ArrowCircle from "../../ArrowCircle";
import styles from "./index.module.scss";
import AnswerPreview from "./AnswerPreview";

interface Props {
  studentId: string;
  assignmentId: string;
  assignmentVersion: string;
  attempt?: SubmissionAttempt;
  saving: boolean;
  blockedReason?: string;
  onSend(text: string, file: File | null): Promise<boolean>;
  showTeacherComment?: boolean;
}

const AnswerComposer = ({ studentId, assignmentId, assignmentVersion, attempt, saving, blockedReason, onSend, showTeacherComment = true }: Props) => {
  const headingId = useId();
  const textId = useId();
  const hintId = useId();
  const draftStatusId = useId();
  const previewId = useId();
  const blockedId = useId();
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
  const hasUnpersistedChanges = Boolean(file) || !draftSaved;
  const busy = saving || sending;
  const blocked = Boolean(blockedReason);
  const retainedAttachmentName = getAssignmentAttachmentName(attempt, "answer");
  const conditionsChanged = previewing && previewVersion !== assignmentVersion;
  useUnsavedChangesWarning(hasLocalChanges && !submitted, (transition) =>
    hasUnpersistedChanges && changesAssignmentAnswer(transition), hasUnpersistedChanges);
  useEffect(() => { if (previewing) previewRef.current?.focus(); }, [previewing]);

  const persist = (nextText: string, fileName?: string) => {
    const saved = saveAnswerDraft(draftKey, { text: nextText, fileName });
    setDraftSaved(saved);
    if (!saved) console.error("Не удалось сохранить текст ответа в черновик этой вкладки.");
    setDraftError(saved ? "" : "Текст сейчас только в форме. Браузер не разрешил сохранить черновик — скопируйте его перед уходом со страницы.");
    setSendError("");
  };
  const returnToEditing = () => { setPreviewing(false); requestAnimationFrame(() => textareaRef.current?.focus()); };
  const send = async () => {
    if (!previewing || conditionsChanged || blocked || busy || submitted || sendLock.current || !text.trim() || missingFile) return;
    sendLock.current = true;
    setSending(true);
    setSendError("");
    try {
      if (await onSend(text.trim(), file)) {
        setSubmitted(true);
        removeAnswerDraft(draftKey);
      }
      else { setSendError("Ответ не отправлен. Текст и выбранный файл остались в форме."); returnToEditing(); }
    } catch (error) {
      console.error("Не удалось отправить ответ на задание. Текст и выбранный файл сохранены в форме.", error);
      setSendError("Ответ не отправлен. Текст и выбранный файл остались в форме — повторите попытку.");
      returnToEditing();
    } finally { sendLock.current = false; setSending(false); }
  };

  return <section className={styles.composer} aria-labelledby={headingId} aria-busy={busy}>
    <header className={styles.header}><h3 id={headingId}>{attempt ? "Исправить мою работу" : "Моя работа"}</h3></header>
    {showTeacherComment && attempt?.teacherComment && <div className={styles.feedback}><strong>Что нужно исправить</strong><p>{attempt.teacherComment}</p></div>}
    {!submitted && blocked && <p id={blockedId} className={styles.hint} role="status">{blockedReason} Текст и выбранный файл остаются в форме. Текст можно выделить и скопировать.</p>}
    {submitted ? <p className={styles.success} role="status">Ответ отправлен преподавателю. Он появится в истории попыток.</p> : previewing ? <AnswerPreview headingId={previewId} headingRef={previewRef} text={text.trim()}
      attachment={file ? `${file.name} · ${formatFileSize(file.size)}` : retainedAttachmentName ?? "Без файла"}
      busy={busy} blockedReason={blockedReason} conditionsChanged={conditionsChanged} revising={Boolean(attempt)} onEdit={returnToEditing} onSend={() => { void send(); }} />
      : <form onSubmit={(event) => { event.preventDefault(); if (text.trim() && !missingFile && !busy && !blocked) { setPreviewVersion(assignmentVersion); setPreviewing(true); } }}>
      <label htmlFor={textId}>Текст ответа <span>Обязательно</span></label>
      <textarea id={textId} ref={textareaRef} required disabled={busy} readOnly={blocked} aria-describedby={`${hintId} ${draftStatusId}${blocked ? ` ${blockedId}` : ""}`} placeholder="Решение, выводы или комментарий к приложенному файлу" value={text} onChange={(event) => { if (busy || blocked) return; setText(event.target.value); persist(event.target.value, file?.name ?? missingFile); }} />
      <div id={draftStatusId} className={styles.draftStatus}><span>{draftError ? "Текст не сохранён в черновик" : draftSaved ? "Текст сохранён до закрытия вкладки" : "Черновик ещё не сохранён"}</span><span>{text.length.toLocaleString("ru-RU")} симв.</span></div>
      <div className={styles.filePicker}><AttachmentPicker label="Файл ответа" file={file} retainedName={retainedAttachmentName} disabled={busy || blocked} onChange={(next) => { if (busy || blocked) return; setFile(next); setMissingFile(undefined); persist(text, next?.name); }} /></div>
      {file && <p className={styles.hint}>Файл выбран для отправки, но не сохраняется в черновике. После обновления страницы его нужно прикрепить заново.</p>}
      {missingFile && <div className={styles.fileReminder} role="status"><span>Прикрепите «{missingFile}» заново. В черновике сохранён только текст, не сам файл.</span><button type="button" disabled={busy || blocked} onClick={() => { if (busy || blocked) return; setMissingFile(undefined); persist(text); }}>{retainedAttachmentName ? "Оставить прежнее вложение" : "Продолжить без файла"}</button></div>}
      <div className={styles.actions}><span id={hintId} className={styles.hint}>Черновик виден только вам. Файл необязателен. Перед отправкой можно проверить ответ.</span><button type="submit" className={styles.primary} disabled={busy || blocked || !text.trim() || Boolean(missingFile)}>{blocked ? "Отправка недоступна" : "Проверить ответ"}<ArrowCircle /></button></div>
    </form>}
    {draftError && <p className={styles.error} role="alert">{draftError}</p>}
    {sendError && <p className={styles.error} role="alert">{sendError}</p>}
  </section>;
};

export default AnswerComposer;
