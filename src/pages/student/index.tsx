import { Link, useParams } from "react-router-dom";
import StudentProfile from "../../components/StudentProfile";
import { getStudentProfile } from "../../data/studentProfiles";
import { getAcademicGroupByName } from "../../data/academicCatalog";
import { useRole } from "../../components/RoleContext";
import styles from "./index.module.scss";

const StudentPage = () => {
  const { studentId } = useParams();
  const { role, currentUser } = useRole();
  const student = getStudentProfile(studentId);
  const groupId = getAcademicGroupByName(student?.group)?.id;
  const canView = role === "teacher" || Boolean(groupId && currentUser.memberships.some((membership) => membership.groupIds.includes(groupId)));
  const backHref = role === "student" ? "/cabinet?tab=group" : "/journal";
  return <div className={`pageContainer ${styles.page}`}><Link className={styles.back} to={backHref}>← {role === "student" ? "Назад к группе" : "Назад к журналу"}</Link>{student && canView ? <StudentProfile student={student} /> : <section className={styles.notFound}><h1>Профиль недоступен</h1><p>Здесь доступны профили студентов вашей группы.</p><Link to={backHref}>Вернуться назад</Link></section>}</div>;
};
export default StudentPage;
