import type { Assignment, Submission } from "../../../data/assignmentStore";
import { getCurrentSubmissionAttempt, getSubmissionStatus } from "../../../domain/assignments";
import { getStudentAssignmentLabel, indexAssignmentSubmissions, matchesAssignmentView, selectAssignmentList, studentAssignmentViews, teacherAssignmentViews, type AssignmentSort, type AssignmentView } from "../../../domain/assignmentViews";
import { formatCount } from "../../../domain/formatCount";
import SearchField from "../../SearchField";
import Dropdown from "../../Dropdown";
import AssignmentIcon from "../AssignmentIcon";
import styles from "./index.module.scss";

interface Props {
  assignments: Assignment[];
  indexes: ReturnType<typeof indexAssignmentSubmissions>;
  role: "teacher" | "student";
  view: AssignmentView;
  query: string;
  sort: AssignmentSort;
  now: Date;
  showContext: boolean;
  onView(view: AssignmentView): void;
  onQuery(query: string): void;
  onSort(sort: AssignmentSort): void;
  onOpen(assignment: Assignment, work?: boolean): void;
  onCreate(): void;
}
const statusLabels = { draft: "Черновик", published: "Опубликовано", closed: "Приём завершён", archived: "В архиве" };
const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dateLabel = (value: string) => Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : "Срок не указан";
const studentAction = (answer?: Submission) => getSubmissionStatus(answer) === "graded" ? "Посмотреть результат" : getSubmissionStatus(answer) === "submitted" ? "Посмотреть ответ" : getSubmissionStatus(answer) === "revision" ? "Исправить работу" : "Открыть задание";

export default function AssignmentList({ assignments, indexes, role, view, query, sort, now, showContext, onView, onQuery, onSort, onOpen, onCreate }: Props) {
  const views = role === "teacher" ? teacherAssignmentViews : studentAssignmentViews;
  const items = selectAssignmentList(assignments, indexes, view, query, sort, now);
  const pending = assignments.reduce((total, item) => total + (indexes.pending.get(item.id) ?? 0), 0);
  return <section className={styles.list} aria-label={role === "teacher" ? "Задания группы" : "Мои задания"}>
    <header className={styles.heading}>
      <div><h2>{role === "teacher" ? "Задания" : "Мои задания"}</h2><p>{role === "teacher" ? `${formatCount(assignments.length, ["задание", "задания", "заданий"])}${pending ? ` · ${formatCount(pending, ["работа", "работы", "работ"])} на проверке` : " · очередь проверки пуста"}` : "Условия, ваши ответы и результаты проверки"}</p></div>
      {role === "teacher" && <button type="button" className={styles.primary} onClick={onCreate}><AssignmentIcon name="plus" />Создать задание</button>}
    </header>
    <div className={styles.controlPanel}>
    <div className={styles.views} role="group" aria-label="Представления заданий">{views.map((option) => {
      const count = assignments.filter((item) => matchesAssignmentView(item, option.value, indexes.pending.get(item.id) ?? 0, indexes.mine.get(item.id), now)).length;
      return <button type="button" aria-pressed={view === option.value} className={view === option.value ? styles.active : ""} key={option.value} onClick={() => onView(option.value)}>{option.label}<span>{count}</span></button>;
    })}</div>
    {assignments.length > 0 && <div className={styles.tools}><div className={styles.searchField}><AssignmentIcon name="search" className={styles.searchIcon} /><SearchField label="Поиск заданий" value={query} onChange={onQuery} placeholder="Название или текст задания" /></div><Dropdown label="Порядок заданий" value={sort} onChange={(value) => onSort(value as AssignmentSort)} options={[{ value: "deadline", label: "По сроку сдачи" }, { value: "newest", label: "Сначала новые" }, { value: "title", label: "По названию" }]} /></div>}
    </div>
    {query.trim() && <p className={styles.searchResult} role="status">Найдено: {formatCount(items.length, ["задание", "задания", "заданий"])}</p>}
    {items.length > 0 ? <>
      <div className={styles.columns} aria-hidden="true"><span>Задание</span><span>Срок сдачи</span><span>{role === "teacher" ? "Работы" : "Моя работа"}</span><span /></div>
      <div className={styles.items}>{items.map((assignment) => {
        const answer = indexes.mine.get(assignment.id);
        const waiting = indexes.pending.get(assignment.id) ?? 0;
        const answers = indexes.byAssignment.get(assignment.id)?.length ?? 0;
        const review = role === "teacher" && waiting > 0;
        const tone = role === "teacher" ? assignment.status : getSubmissionStatus(answer) ?? "pending";
        const overdue = role === "student" && !answer && Date.parse(assignment.deadline) < now.getTime();
        return <article className={styles.item} data-assignment-id={assignment.id} key={assignment.id}>
          <div className={styles.identity}><span className={styles.documentIcon} aria-hidden="true"><AssignmentIcon name="document" size={20} /></span><div className={styles.identityText}><div className={styles.titleLine}><button type="button" data-assignment-open={assignment.id} className={styles.title} onClick={() => onOpen(assignment)}>{assignment.title}</button>{role === "teacher" && <span className={`${styles.badge} ${styles[tone] ?? ""}`}>{statusLabels[assignment.status]}</span>}</div><p>{assignment.lessonType} · {new Date(assignment.lessonDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}{showContext ? ` · ${assignment.subject} · ${assignment.group}` : ""}</p></div></div>
          <div className={`${styles.deadline} ${overdue ? styles.overdue : ""}`}><span className={styles.mobileLabel}>Срок сдачи</span><time dateTime={assignment.deadline}>{dateLabel(assignment.deadline)}</time></div>
          <div className={styles.status}>{role === "teacher" ? <><strong>{formatCount(answers, ["ответ", "ответа", "ответов"])}</strong><span className={waiting ? styles.attention : ""}>{waiting ? `${waiting} на проверке` : "Новых работ нет"}</span></> : <><strong className={styles[tone] ?? ""}>{getStudentAssignmentLabel(assignment, answer, now)}</strong>{getCurrentSubmissionAttempt(answer)?.grade && <span>Оценка {getCurrentSubmissionAttempt(answer)!.grade}</span>}</>}</div>
          <button type="button" className={review ? styles.review : styles.open} onClick={() => onOpen(assignment, review)} aria-label={`${review ? "Проверить работы" : "Открыть задание"}: ${assignment.title}`}>{review ? `Проверить ${waiting}` : role === "teacher" ? assignment.status === "draft" ? "Редактировать" : "Открыть" : studentAction(answer)}<AssignmentIcon name="arrowRight" size={16} /></button>
        </article>;
      })}</div>
    </> : <div className={styles.empty}><span className={styles.emptyIcon} aria-hidden="true"><AssignmentIcon name={view === "review" && !query.trim() ? "check" : "document"} size={26} /></span><h3>{query.trim() ? "Задания не найдены" : !assignments.length ? "Заданий пока нет" : view === "review" ? "Всё проверено" : view === "todo" ? "Сейчас ничего сдавать не нужно" : "В этом разделе заданий нет"}</h3><p>{query.trim() ? "Попробуйте другое название или сбросьте поиск." : !assignments.length ? role === "teacher" ? "Создайте задание: добавьте условие и срок, затем опубликуйте его для группы." : "Опубликованные задания преподавателя появятся здесь." : "Другие задания и результаты доступны в соседних разделах."}</p>{query ? <button type="button" onClick={() => onQuery("")}>Сбросить поиск</button> : !assignments.length && role === "teacher" ? <button type="button" className={styles.primary} onClick={onCreate}>Создать первое задание</button> : assignments.length > 0 && role === "student" && view !== "all" ? <button type="button" onClick={() => onView("all")}>Все задания</button> : null}</div>}
  </section>;
}
