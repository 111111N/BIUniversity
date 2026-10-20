import { Link } from "react-router-dom";
import type { StudentProfileData } from "../../data/studentProfiles";
import { getAcademicGroupByName } from "../../data/academicCatalog";
import { getStudentProfileMetrics } from "../../data/studentProfileMetrics";
import { formatDashboardValue } from "../../domain/dashboard";
import { useRole } from "../RoleContext";
import styles from "./index.module.scss";
const StudentProfile = ({ student }: { student: StudentProfileData }) => {
  const { role, currentUser } = useRole();
  const isOwnProfile = currentUser.id === student.id;
  const showAcademicDetails = role === "teacher" || isOwnProfile;
  const metrics = showAcademicDetails ? getStudentProfileMetrics(student.id, getAcademicGroupByName(student.group)?.id) : null;

  return <div className={styles.content}>
    <section className={styles.hero}><div className={styles.avatar}>{student.initials}</div><div className={styles.identity}><span>Студент · {student.course} курс</span><h1>{student.name}</h1><p>{student.group} · {student.email}</p></div>{!isOwnProfile && <Link className={styles.messageButton} to={`/messages?student=${student.id}`}>Написать сообщение</Link>}</section>
    {metrics && <><section className={styles.metrics}><article><span>Средний балл</span><strong>{formatDashboardValue(metrics.averageGrade, 2)}</strong><small>по проведённым занятиям в журналах группы</small></article><article><span>Посещаемость</span><strong>{formatDashboardValue(metrics.attendance)}{metrics.attendance !== null ? "%" : ""}</strong><small>по отмеченным проведённым занятиям</small></article><article><span>Сдано заданий</span><strong>{metrics.completedWorks === null || metrics.totalWorks === null ? "—" : `${metrics.completedWorks}/${metrics.totalWorks}`}</strong><small>на проверке или проверены · доработка не включена</small></article></section>{metrics.error && <p role="status">{metrics.error}</p>}</>}
    <section className={styles.details}><div><span>Учебная группа</span><strong>{student.group}</strong></div><div><span>Корпоративная почта</span><strong>{student.email}</strong></div>{showAcademicDetails && <div><span>Статус</span><strong className={styles.active}>Обучается</strong></div>}</section>
  </div>;
};
export default StudentProfile;
