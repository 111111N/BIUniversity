import { Link } from "react-router-dom";
import type { StudentProfileData } from "../../data/studentProfiles";
import { useRole } from "../RoleContext";
import styles from "./index.module.scss";
const StudentProfile = ({ student }: { student: StudentProfileData }) => {
  const { role, currentUser } = useRole();
  const isOwnProfile = currentUser.id === student.id;
  const showAcademicDetails = role === "teacher" || isOwnProfile;

  return <div className={styles.content}>
    <section className={styles.hero}><div className={styles.avatar}>{student.initials}</div><div className={styles.identity}><span>Студент · {student.course} курс</span><h1>{student.name}</h1><p>{student.group} · {student.email}</p></div>{!isOwnProfile && <Link className={styles.messageButton} to={`/messages?student=${student.id}`}>Написать сообщение</Link>}</section>
    {showAcademicDetails && <section className={styles.metrics}><article><span>Средний балл</span><strong>{student.averageGrade}</strong><small>за текущий семестр</small></article><article><span>Посещаемость</span><strong>{student.attendance}%</strong><small>по всем дисциплинам</small></article><article><span>Сдано работ</span><strong>{student.completedWorks}/{student.totalWorks}</strong><small>практические и задания</small></article></section>}
    <section className={styles.details}><div><span>Учебная группа</span><strong>{student.group}</strong></div><div><span>Корпоративная почта</span><strong>{student.email}</strong></div>{showAcademicDetails && <><div><span>Статус</span><strong className={student.risk ? styles.risk : styles.active}>{student.risk ? `Риск: ${student.risk.toLowerCase()}` : "Обучается"}</strong></div>{student.note && <div className={styles.note}><span>Требует внимания</span><strong>{student.note}</strong></div>}</>}</section>
  </div>;
};
export default StudentProfile;
