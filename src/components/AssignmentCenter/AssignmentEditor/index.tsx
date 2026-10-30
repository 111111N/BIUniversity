import { useId, useState, type FormEvent, type RefObject } from "react";
import type { AssignmentStatus, LessonType } from "../../../data/assignmentStore";
import { ACADEMIC_SUBJECTS, getAcademicSubjectByName, getSubjectGroups, isAcademicMembershipMatch } from "../../../data/academicCatalog";
import { getAssignmentFormError, getAssignmentVisibility, type AssignmentForm } from "../../../domain/assignmentForm";
import AttachmentPicker from "../../AttachmentPicker";
import Checkbox from "../../Checkbox";
import DateTimePicker from "../../DateTimePicker";
import Dropdown from "../../Dropdown";
import { useRole } from "../../RoleContext";
import AssignmentIcon from "../AssignmentIcon";
import styles from "./index.module.scss";

export interface Props {
  form: AssignmentForm;
  onChange(form: AssignmentForm): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onSaveDraft(): void;
  onCancel(): void;
  editing: boolean;
  originalStatus?: AssignmentStatus;
  saving: boolean;
  unavailableReason?: string;
  dirty: boolean;
  error: string;
  file: File | null;
  retainedAttachmentName?: string;
  onFileChange(file: File | null): void;
  subjectLocked: boolean;
  groupLocked: boolean;
  formRef: RefObject<HTMLFormElement | null>;
  titleRef: RefObject<HTMLInputElement | null>;
  errorRef: RefObject<HTMLParagraphElement | null>;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Черновик" },
  { value: "published", label: "Опубликовано" },
  { value: "closed", label: "Приём завершён" },
  { value: "archived", label: "Архив" },
];

const AssignmentEditor = ({ form, onChange, onSubmit, onSaveDraft, onCancel, editing, originalStatus, saving, unavailableReason, dirty, error, file, retainedAttachmentName, onFileChange, subjectLocked, groupLocked, formRef, titleRef, errorRef }: Props) => {
  const id = useId();
  const { currentUser } = useRole();
  const [interactionError, setInteractionError] = useState("");
  const subjects = ACADEMIC_SUBJECTS.filter((subject) => currentUser.memberships.some((membership) => membership.subjectId === subject.id));
  const subjectId = getAcademicSubjectByName(form.subject)?.id;
  const membership = currentUser.memberships.find((item) => item.subjectId === subjectId);
  const groups = subjectId ? getSubjectGroups(subjectId).filter((group) => membership?.groupIds.includes(group.id)) : [];
  const validationError = error ? getAssignmentFormError(form, currentUser.memberships) : "";
  const titleInvalid = Boolean(validationError) && !form.title.trim();
  const descriptionInvalid = Boolean(validationError) && !form.description.trim();
  const lessonTime = Date.parse(form.lessonDate);
  const deadlineTime = Date.parse(form.deadline);
  const lessonInvalid = Boolean(validationError) && !Number.isFinite(lessonTime);
  const deadlineInvalid = Boolean(validationError) && (!Number.isFinite(deadlineTime) || deadlineTime < lessonTime);
  const contextInvalid = Boolean(validationError) && !isAcademicMembershipMatch(currentUser.memberships, form.subject, form.group);
  const canSaveDraft = (!editing || originalStatus === "draft") && form.status !== "draft";
  const errorMessage = interactionError || error;
  const lockedContext = [subjectLocked ? form.subject : "", groupLocked ? `Группа ${form.group}` : ""].filter(Boolean).join(" · ");
  const blocked = Boolean(unavailableReason);
  const fieldsDisabled = saving || blocked;
  const unavailableId = blocked ? `${id}-unavailable` : undefined;

  const runAction = (action: () => void, { allowUnavailable = false }: { allowUnavailable?: boolean } = {}) => {
    if (saving || (blocked && !allowUnavailable)) return;
    try { setInteractionError(""); action(); }
    catch (caughtError) {
      console.error("Не удалось выполнить действие в редакторе задания:", caughtError);
      setInteractionError("Не удалось выполнить действие. Введённые данные остались в форме — повторите попытку.");
    }
  };
  const changeDate = (field: "lessonDate" | "deadline", date?: Date) => {
    if (!date) return;
    runAction(() => {
      const offset = date.getTimezoneOffset() * 60_000;
      onChange({ ...form, [field]: new Date(date.getTime() - offset).toISOString().slice(0, 16) });
    });
  };
  const selectSubject = (subjectName: string) => {
    const nextSubjectId = getAcademicSubjectByName(subjectName)?.id;
    const nextMembership = currentUser.memberships.find((item) => item.subjectId === nextSubjectId);
    const nextGroups = nextSubjectId ? getSubjectGroups(nextSubjectId).filter((item) => nextMembership?.groupIds.includes(item.id)) : [];
    onChange({ ...form, subject: subjectName, group: groupLocked ? form.group : nextGroups[0]?.name ?? form.group });
  };

  return <form ref={formRef} className={styles.editor} noValidate aria-labelledby={`${id}-heading`} aria-busy={saving} onSubmit={(event) => { event.preventDefault(); runAction(() => onSubmit(event)); }}>
    <button type="button" className={styles.back} disabled={saving} onClick={() => runAction(onCancel, { allowUnavailable: true })}><AssignmentIcon name="arrowLeft" /> {editing ? "К заданию" : "К заданиям"}</button>
    <header className={styles.header}>
      <div>
        {lockedContext && <p className={styles.context}>{lockedContext}</p>}
        <h2 id={`${id}-heading`}>{editing ? "Редактирование задания" : "Новое задание"}</h2>
        <p className={styles.intro}>Подготовьте условие и сроки. Перед сохранением вы сможете проверить результат.</p>
      </div>
      <span className={styles.draftState}>{dirty ? "Есть несохранённые изменения" : editing ? "Нет новых изменений" : "Ещё не сохранено"}</span>
    </header>
    {blocked && <p id={unavailableId} className={styles.unavailable} role="status">Сохранение недоступно. {unavailableReason} Название, условие и выбранный файл остаются в форме. Текст можно выделить и скопировать перед выходом.</p>}

    <fieldset className={styles.section} disabled={saving} aria-describedby={unavailableId}>
      <legend><span aria-hidden="true">01</span> Содержание</legend>
      <div className={styles.sectionBody}>
        <div className={styles.field}>
          <label htmlFor={`${id}-title`}>Название <span className={styles.required}>Обязательно</span></label>
          <input id={`${id}-title`} ref={titleRef} required readOnly={blocked} value={form.title} placeholder="Например, практикум по условной вероятности" aria-invalid={titleInvalid || undefined} aria-describedby={[titleInvalid ? `${id}-title-error` : "", unavailableId].filter(Boolean).join(" ") || undefined} onChange={(event) => runAction(() => onChange({ ...form, title: event.target.value }))} />
          {titleInvalid && <p id={`${id}-title-error`} className={styles.fieldError}>Укажите название задания — не только пробелы.</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-description`}>Условие задания <span className={styles.required}>Обязательно</span></label>
          <textarea id={`${id}-description`} required readOnly={blocked} rows={8} value={form.description} placeholder="Что нужно сделать, как оформить ответ и по каким критериям он оценивается" aria-invalid={descriptionInvalid || undefined} aria-describedby={`${id}-description-hint${descriptionInvalid ? ` ${id}-description-error` : ""}${blocked ? ` ${unavailableId}` : ""}`} onChange={(event) => runAction(() => onChange({ ...form, description: event.target.value }))} />
          <p id={`${id}-description-hint`} className={styles.hint}>Опишите результат работы и требования к ответу. Переносы строк сохранятся.</p>
          {descriptionInvalid && <p id={`${id}-description-error`} className={styles.fieldError}>Добавьте описание задания — не только пробелы.</p>}
        </div>
        <div className={styles.attachment}><AttachmentPicker label="Файл задания" file={file} retainedName={retainedAttachmentName} disabled={fieldsDisabled} onChange={(next) => runAction(() => onFileChange(next))} /></div>
      </div>
    </fieldset>

    <fieldset className={styles.section} disabled={fieldsDisabled} aria-describedby={unavailableId}>
      <legend><span aria-hidden="true">02</span> Занятие и срок</legend>
      <div className={styles.sectionBody}>
        {(!subjectLocked || !groupLocked) && <div className={styles.grid}>
          {!subjectLocked && <Dropdown className={styles.choice} label="Дисциплина" value={form.subject} disabled={fieldsDisabled} options={subjects.map((item) => ({ value: item.name, label: item.name }))} onChange={(value) => runAction(() => selectSubject(value))} />}
          {!groupLocked && <Dropdown className={styles.choice} label="Группа" value={form.group} disabled={fieldsDisabled} options={groups.map((item) => ({ value: item.name, label: item.name }))} onChange={(value) => runAction(() => onChange({ ...form, group: value }))} />}
        </div>}
        {contextInvalid && <p className={styles.fieldError}>Дисциплина или группа не назначены вашему профилю. Выберите доступный журнал.</p>}
        <div className={styles.grid}>
          <Dropdown className={styles.choice} label="Тип занятия" value={form.lessonType} disabled={fieldsDisabled} options={["Лекция", "Практика", "Лабораторная"].map((value) => ({ value, label: value }))} onChange={(value) => runAction(() => onChange({ ...form, lessonType: value as LessonType }))} />
          <div className={styles.dateField}>
            <span id={`${id}-lesson-label`} className={styles.fieldLabel}>Дата и время занятия</span>
            <div role="group" aria-labelledby={`${id}-lesson-label`} aria-describedby={lessonInvalid ? `${id}-lesson-error` : undefined}><DateTimePicker disabled={fieldsDisabled} value={Number.isFinite(lessonTime) ? new Date(form.lessonDate) : undefined} onChange={(date) => changeDate("lessonDate", date)} placeholder="Выберите занятие" ariaLabel="Дата и время занятия" /></div>
            {lessonInvalid && <p id={`${id}-lesson-error`} className={styles.fieldError}>Выберите дату и время занятия.</p>}
          </div>
        </div>
        <div className={styles.deadline}>
          <div className={styles.dateField}>
            <span id={`${id}-deadline-label`} className={styles.fieldLabel}>Срок сдачи</span>
            <div role="group" aria-labelledby={`${id}-deadline-label`} aria-describedby={deadlineInvalid ? `${id}-deadline-error` : `${id}-deadline-hint`}><DateTimePicker disabled={fieldsDisabled} value={Number.isFinite(deadlineTime) ? new Date(form.deadline) : undefined} onChange={(date) => changeDate("deadline", date)} placeholder="Выберите дедлайн" ariaLabel="Срок сдачи" /></div>
            {deadlineInvalid && <p id={`${id}-deadline-error`} className={styles.fieldError}>{!Number.isFinite(deadlineTime) ? "Выберите дату и время сдачи." : "Срок сдачи не может быть раньше даты занятия."}</p>}
          </div>
          <p id={`${id}-deadline-hint`} className={styles.hint}>Студенты увидят эту дату в задании. Приём после срока зависит от параметров ниже.</p>
        </div>
      </div>
    </fieldset>

    <fieldset className={styles.section} disabled={fieldsDisabled} aria-describedby={unavailableId}>
      <legend><span aria-hidden="true">03</span> Параметры приёма</legend>
      <div className={styles.sectionBody}>
        <div className={styles.receipt}>
          <Checkbox className={styles.checkbox} label="Разрешить ответы после срока сдачи" checked={form.allowLateSubmissions} disabled={fieldsDisabled} onChange={(checked) => runAction(() => onChange({ ...form, allowLateSubmissions: checked }))} />
          <p className={styles.hint}>{form.allowLateSubmissions ? "Ответы после срока будут отмечены как отправленные с опозданием." : "После срока новые ответы не принимаются."}</p>
        </div>
        {editing && <details className={styles.advanced}>
          <summary>Дополнительные параметры</summary>
          <div className={styles.advancedBody}>
            <Dropdown className={styles.choice} label="Состояние задания после сохранения" value={form.status} disabled={fieldsDisabled} options={STATUS_OPTIONS} onChange={(value) => runAction(() => onChange({ ...form, status: value as AssignmentStatus }))} />
            <p className={styles.hint}>Изменение применится после проверки и сохранения задания.</p>
          </div>
        </details>}
        <div className={styles.visibility}><strong>После сохранения</strong><p>{getAssignmentVisibility(form.status)}</p></div>
      </div>
    </fieldset>

    {errorMessage && <p ref={errorRef} tabIndex={-1} className={styles.error} role="alert">{errorMessage}</p>}
    <footer className={styles.footer}>
      <p>{blocked ? "Сохранение недоступно. Скопируйте текст перед выходом." : dirty ? "Изменения ещё не сохранены." : "Сохранение произойдёт после предпросмотра."}</p>
      <div className={styles.actions}>
        <button type="button" disabled={saving} onClick={() => runAction(onCancel, { allowUnavailable: true })}>Отмена</button>
        {canSaveDraft && <button type="button" disabled={fieldsDisabled} onClick={() => runAction(onSaveDraft)}>Сохранить черновик</button>}
        <button type="submit" className={styles.primary} disabled={fieldsDisabled}>{saving ? "Сохраняем…" : "Предпросмотр"}<AssignmentIcon name="arrowRight" /></button>
      </div>
    </footer>
  </form>;
};

export default AssignmentEditor;
