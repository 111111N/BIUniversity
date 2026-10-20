import { useEffect, useRef, useState, type RefObject } from "react";
import type { Assignment } from "../../../data/assignmentStore";
import AssignmentIcon from "../AssignmentIcon";
import styles from "./index.module.scss";

interface Props {
  assignment: Assignment;
  teacher: boolean;
  saving: boolean;
  work: boolean;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onBack(): void;
  onPublish(): void;
  onEdit(): void;
  onDelete(): void;
}

const statusLabels = { draft: "Черновик", published: "Опубликовано", closed: "Приём завершён", archived: "В архиве" };
const dateLabel = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function AssignmentHeader({ assignment, teacher, saving, work, titleRef, onBack, onPublish, onEdit, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMenuOpen(false); }, [assignment.id, work]);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  return <header className={styles.header}>
    <div className={styles.topline}>
      <button type="button" aria-label="К заданиям" className={styles.back} onClick={onBack}><AssignmentIcon name="arrowLeft" />К заданиям</button>
      {teacher && <div className={styles.actions} ref={actionsRef}>
        {assignment.status === "draft" && <button type="button" disabled={saving} className={styles.primary} onClick={onPublish}>Опубликовать</button>}
        <button type="button" ref={buttonRef} aria-expanded={menuOpen} aria-controls="assignment-actions" disabled={saving} onClick={() => setMenuOpen((current) => !current)}><AssignmentIcon name="more" />Действия</button>
        {menuOpen && <div id="assignment-actions" className={styles.menu}>
          <button type="button" onClick={() => { setMenuOpen(false); onEdit(); }}>Редактировать задание</button>
          <button type="button" className={styles.danger} onClick={() => { setMenuOpen(false); onDelete(); }}>Удалить задание</button>
          <button type="button" onClick={() => { setMenuOpen(false); buttonRef.current?.focus(); }}>Закрыть меню</button>
        </div>}
      </div>}
    </div>
    <h2 ref={titleRef} tabIndex={-1}>{assignment.title}</h2>
    <div className={styles.meta}>
      <span className={styles.badge} data-status={assignment.status}>{statusLabels[assignment.status]}</span>
      <span><AssignmentIcon name="calendar" size={16} />{assignment.lessonType} · {dateLabel(assignment.lessonDate)}</span>
      <span className={styles.deadline}><AssignmentIcon name="clock" size={16} />Срок сдачи: <strong>{dateLabel(assignment.deadline)}</strong></span>
    </div>
  </header>;
}
