import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSemesterSubjects, getSubjectHours } from "../../data/studyPlan";
import { useRole } from "../RoleContext";
import styles from "./index.module.scss";

const semesters = [3, 4] as const;

const StudyPlan = ({ teacher = false }: { teacher?: boolean }) => {
  const { currentUser } = useRole();
  const [semester, setSemester] = useState<(typeof semesters)[number]>(3);
  const availableSemesters = teacher ? semesters.filter((item) => getSemesterSubjects(item).some((subject) => subject.teacher === currentUser.name)) : semesters;
  const subjects = useMemo(() => getSemesterSubjects(semester).filter((subject) => !teacher || subject.teacher === currentUser.name), [semester, teacher, currentUser.name]);
  const totals = useMemo(() => subjects.reduce((result, subject) => ({
    lectures: result.lectures + subject.lectures, practice: result.practice + subject.practice,
    labs: result.labs + subject.labs, independent: result.independent + subject.independent,
    all: result.all + getSubjectHours(subject),
  }), { lectures: 0, practice: 0, labs: 0, independent: 0, all: 0 }), [subjects]);
  const classroomHours = totals.lectures + totals.practice + totals.labs;

  return <section className={styles.plan} aria-labelledby="study-plan-title">
    <header className={styles.header}>
      <div><span>{teacher ? "Учебная нагрузка" : "2026/2027 учебный год"}</span><h2 id="study-plan-title">Учебный план</h2><p>{teacher ? "Распределение часов по дисциплинам и видам занятий." : "Дисциплины, нагрузка и формы промежуточной аттестации."}</p></div>
      <div className={styles.semesters} aria-label="Выбор семестра">{availableSemesters.map((item) => <button type="button" aria-pressed={semester === item} className={semester === item ? styles.activeSemester : ""} onClick={() => setSemester(item)} key={item}>{item} семестр</button>)}</div>
    </header>
    <div className={styles.summary}>
      <div><span>Дисциплины</span><strong>{subjects.length}</strong></div><div><span>Всего часов</span><strong>{totals.all}</strong></div>
      <div><span>Аудиторные</span><strong>{classroomHours}</strong></div><div><span>Самостоятельные</span><strong>{totals.independent}</strong></div>
    </div>
    <div className={styles.tableWrap}><table>
      <thead><tr><th>Дисциплина</th><th>Лекции</th><th>Практика</th><th>Лаб.</th><th>Самост.</th><th>Всего</th><th>Контроль</th><th aria-label="Дополнительно" /></tr></thead>
      <tbody>{subjects.map((subject) => <tr key={subject.id}>
        <td data-label="Дисциплина"><Link to={`/journal/${subject.id}`}><strong>{subject.name}</strong></Link><span>{subject.teacher}</span></td>
        <td data-label="Лекции">{subject.lectures || "—"}</td><td data-label="Практика">{subject.practice || "—"}</td><td data-label="Лабораторные">{subject.labs || "—"}</td>
        <td data-label="Самостоятельно">{subject.independent}</td><td data-label="Всего"><strong>{getSubjectHours(subject)}</strong></td><td data-label="Контроль"><span className={styles.control}>{subject.control}</span></td>
        <td className={styles.actions}>{subject.hasProgram ? <span title="Рабочая программа появится после подключения документов вуза">РПД</span> : <span title="Рабочая программа пока не загружена">—</span>}</td>
      </tr>)}</tbody>
      <tfoot><tr><td>Итого за семестр</td><td>{totals.lectures}</td><td>{totals.practice}</td><td>{totals.labs}</td><td>{totals.independent}</td><td>{totals.all}</td><td colSpan={2} /></tr></tfoot>
    </table></div>
    <p className={styles.note}>РПД — рабочая программа дисциплины. Документы станут доступны после подключения API университета.</p>
  </section>;
};
export default StudyPlan;
