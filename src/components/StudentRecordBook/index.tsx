import { Link, useSearchParams } from "react-router-dom";
import Dropdown from "../Dropdown";
import { useRole } from "../RoleContext";
import { useAssessments } from "../../hooks/useAssessments";
import { createAssessmentExamples } from "../../data/assessmentExamples";
import { ASSESSMENT_KIND_LABELS, ATTEMPT_KIND_LABELS, assessmentOutcomeLabel, type Assessment, type AssessmentTeacherOption } from "../../domain/assessmentTypes";
import { buildStudentRecordBook, RECORD_BOOK_SECTIONS, type RecordBookSection, type StudentRecordBookRow } from "../../domain/studentRecordBook";
import styles from "./index.module.scss";

const displayDate = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
export function RecordBookTable({ title, rows, example = false }: { title: string; rows: StudentRecordBookRow[]; example?: boolean }) {
  return <section className={styles.section} aria-label={title}><header><h3>{title}</h3><span>{rows.length}</span></header>
    {rows.length ? <table role="table"><caption className={styles.srOnly}>{title}: результаты аттестаций</caption><thead><tr role="row">{["Название", "Часы", "Дата и время", "Оценка", "Преподаватель"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr role="row" key={row.id}>
      <td data-label="Название"><Link to={`/assessments/${encodeURIComponent(row.id)}${example ? "?example=1" : ""}`}>{row.title}</Link><small>{ASSESSMENT_KIND_LABELS[row.kind]}{row.attemptKind !== "primary" ? ` · ${ATTEMPT_KIND_LABELS[row.attemptKind]}` : ""}</small>{row.attempts > 1 && <small>Опубликованных попыток: {row.attempts}</small>}</td>
      <td data-label="Часы">{row.hours ?? "—"}</td>
      <td data-label="Дата и время"><time dateTime={`${row.date}T${row.startsAt}:00+03:00`}>{displayDate(row.date)}<small>{row.startsAt} · Москва</small></time></td>
      <td data-label="Оценка"><strong className={row.outcome.status === "failed" || (row.outcome.status === "graded" && row.outcome.grade === 2) ? styles.failed : styles.grade}>{assessmentOutcomeLabel(row.outcome)}</strong></td>
      <td data-label="Преподаватель">{row.teacher ?? "Не указан"}</td>
    </tr>)}</tbody></table> : <p className={styles.empty}>Опубликованных результатов нет.</p>}
  </section>;
}

export function RecordBookContent({ assessments, teachers, studentId, number, example = false }: { assessments: Assessment[]; teachers: AssessmentTeacherOption[]; studentId: string; number?: string; example?: boolean }) {
  const [params, setParams] = useSearchParams();
  const semesters = buildStudentRecordBook(assessments, teachers, studentId);
  const requested = params.get("semester");
  const selected = semesters.find((semester) => semester.key === requested) ?? semesters.filter((semester) => semester.semester !== null).at(-1) ?? semesters[0];
  const selectedIndex = semesters.findIndex((semester) => semester.key === selected?.key);
  const selectSemester = (key: string) => setParams((current) => { const next = new URLSearchParams(current); next.set("semester", key); return next; });
  const rowsFor = (section: RecordBookSection) => selected?.rows.filter((row) => row.section === section) ?? [];
  return <div className={styles.book}>
    <div className={styles.heading}><div><h2>Зачётная книжка</h2><p>{number ? `№ ${number}` : "Номер зачётки ещё не выдан"}</p></div>{selected && <div className={styles.semesterPicker}><Dropdown label="Семестр" value={selected.key} options={semesters.map((semester) => ({ value: semester.key, label: semester.semester === null ? "Семестр не указан" : `${semester.semester} семестр` }))} onChange={selectSemester} /><div className={styles.arrows}><button type="button" disabled={selectedIndex <= 0} aria-label="Предыдущий семестр" onClick={() => selectSemester(semesters[selectedIndex - 1].key)}>←</button><button type="button" disabled={selectedIndex >= semesters.length - 1} aria-label="Следующий семестр" onClick={() => selectSemester(semesters[selectedIndex + 1].key)}>→</button></div></div>}</div>
    <p className={styles.note}>Последний опубликованный результат по каждой аттестации. История пересдач открывается по названию. Даты и время указаны по Москве.</p>
    {!selected ? <div className={styles.empty}>Зачётка пока пуста. Результаты появятся после публикации ведомостей преподавателями.</div> : <>
      {selected.semester === null && <p className={styles.notice} role="status">В этих записях семестр и часы ещё не указаны. Настройщик может заполнить реквизиты зачётки в аттестации.</p>}
      <div className={styles.columns}><RecordBookTable title="Зачёты" rows={rowsFor("passes")} example={example} /><RecordBookTable title="Экзамены" rows={rowsFor("exams")} example={example} /></div>
      {(["internships", "coursework", "electives", "theses"] as const).filter((section) => rowsFor(section).length > 0).map((section) => <RecordBookTable key={section} title={RECORD_BOOK_SECTIONS[section]} rows={rowsFor(section)} example={example} />)}
    </>}
  </div>;
}

function OwnRecordBook({ studentId, number }: { studentId: string; number?: string }) {
  const { snapshot, loading, error, refresh } = useAssessments(studentId);
  if (error) return <div className={styles.notice} role="alert"><p>Не удалось прочитать зачётку: {error}</p><button type="button" onClick={refresh}>Повторить загрузку</button></div>;
  if (!snapshot) return <p role="status">Загружаем зачётку…</p>;
  return <>{loading && <p className={styles.note} role="status">Обновляем результаты…</p>}<RecordBookContent assessments={snapshot.assessments} teachers={snapshot.teachers} studentId={studentId} number={number} /></>;
}

export default function StudentRecordBook() {
  const { currentUser, role } = useRole();
  const [params, setParams] = useSearchParams();
  if (role !== "student") return null;
  const example = params.get("example") === "1";
  const data = example ? createAssessmentExamples(currentUser.id) : null;
  return <div className={styles.book}><div className={styles.modeActions}><button type="button" aria-pressed={example} onClick={() => setParams((current) => { const next = new URLSearchParams(current); if (example) next.delete("example"); else next.set("example", "1"); next.delete("semester"); return next; })}>{example ? "Показать мою зачётку" : "Посмотреть пример за 4 курса"}</button></div>
    {data ? <><p className={styles.notice} role="status">Демо-зачётка за 4 курса · 8 семестров. Это вымышленные примеры, они не меняют ваши результаты.</p><RecordBookContent {...data} studentId={currentUser.id} example /></> : <OwnRecordBook key={currentUser.id} studentId={currentUser.id} number={currentUser.studentRecord?.number} />}
  </div>;
}
