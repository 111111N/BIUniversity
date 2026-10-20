import { Link } from "react-router-dom";
import type { TeacherProfileData } from "../../data/teacherProfiles";
import { useRole } from "../RoleContext";
import styles from "./index.module.scss";

const TeacherProfile = ({ teacher }: { teacher: TeacherProfileData }) => {
  const { currentUser } = useRole();
  return <div className={styles.content}>
    <section className={styles.hero}><div className={styles.avatar}>{teacher.initials}</div><div className={styles.identity}><span>{teacher.position}</span><h1>{teacher.name}</h1><p>{teacher.department} · {teacher.email}</p></div>{teacher.id !== currentUser.id && <Link className={styles.messageButton} to={`/messages?contact=${teacher.id}`}>Написать сообщение</Link>}</section>
    <section className={styles.metrics}><article><span>Дисциплины</span><strong>{teacher.subjects.length}</strong><small>{teacher.subjects.join(" · ")}</small></article><article><span>Учебные группы</span><strong>{teacher.groups}</strong><small>в текущем семестре</small></article><article><span>Нагрузка</span><strong>{teacher.workload}</strong><small>академических часов</small></article></section>
    <section className={styles.details}><div><span>Должность</span><strong>{teacher.position}</strong></div><div><span>Подразделение</span><strong>{teacher.department}</strong></div><div><span>Корпоративная почта</span><strong>{teacher.email}</strong></div></section>
  </div>;
};

export default TeacherProfile;
