import { useId } from "react";
import type { AssignmentForm } from "../../../domain/assignmentForm";
import { getAssignmentVisibility } from "../../../domain/assignmentForm";
import { formatFileSize } from "../../../domain/files";
import Modal from "../../Modal";
import styles from "./index.module.scss";

interface Props { form: AssignmentForm; attachmentName?: string; attachmentSize?: number; publishing: boolean; saving: boolean; unavailableReason?: string; error: string; onBack(): void; onSave(): void }
const STATUS_LABELS = { draft: "Черновик", published: "Опубликовано", closed: "Приём завершён", archived: "Архив" };
const AssignmentPreview = ({ form, attachmentName, attachmentSize, publishing, saving, unavailableReason, error, onBack, onSave }: Props) => {
  const titleId = useId();
  const unavailableId = useId();
  const blocked = Boolean(unavailableReason);
  const deadlinePassed = Date.parse(form.deadline) < Date.now();
  const back = () => { if (!saving) onBack(); };
  return <Modal labelledBy={titleId} onClose={back} className={styles.dialog}>
    <header><span>Предпросмотр</span><h2 id={titleId}>Проверьте задание</h2><p>Просмотрите условие, срок и видимость задания перед сохранением.</p></header>
    {blocked && <p id={unavailableId} className={styles.warning} role="status">Сохранение недоступно. {unavailableReason} Вернитесь к форме, чтобы скопировать текст. Введённые данные и выбранный файл остаются в форме.</p>}
    <article className={styles.preview}><div className={styles.meta}><span>{form.lessonType}</span><span>{STATUS_LABELS[form.status]}</span></div><h3>{form.title.trim()}</h3><p className={styles.context}>{form.subject} · {form.group}</p><dl><div><dt>Занятие</dt><dd>{new Date(form.lessonDate).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</dd></div><div><dt>Срок сдачи</dt><dd>{new Date(form.deadline).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</dd></div></dl><section className={styles.condition}><h4>Условие задания</h4><p>{form.description.trim()}</p></section><div className={styles.attachment}><span>Файл задания</span><strong>{attachmentName ?? "Без вложения"}</strong>{attachmentSize !== undefined && <small>{formatFileSize(attachmentSize)}</small>}</div></article>
    <div className={styles.visibility}><strong>Кто увидит задание</strong><p>{getAssignmentVisibility(form.status)}</p>{form.status === "published" && <small>{form.allowLateSubmissions ? "Ответы после срока разрешены." : "После дедлайна приём ответов закрывается."}</small>}</div>
    {form.status === "published" && deadlinePassed && <p className={styles.warning} role="status">Срок сдачи уже прошёл. {form.allowLateSubmissions ? "Студенты смогут сдать работу с отметкой об опоздании." : "Студенты не смогут отправить ответ. Вернитесь к редактированию, если нужно изменить срок."}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <footer aria-busy={saving}><button type="button" disabled={saving} onClick={back}>{blocked ? "К тексту задания" : "Вернуться к редактированию"}</button><button type="button" disabled={saving || blocked} aria-describedby={blocked ? unavailableId : undefined} className={styles.primary} onClick={() => { if (!saving && !blocked) onSave(); }}>{saving ? "Сохраняем…" : blocked ? "Сохранение недоступно" : publishing ? "Опубликовать задание" : form.status === "draft" ? "Сохранить черновик" : form.status === "closed" ? "Завершить приём" : form.status === "archived" ? "Отправить в архив" : "Сохранить изменения"}</button></footer>
  </Modal>;
};
export default AssignmentPreview;
