import { Link, useParams, useSearchParams } from "react-router-dom";
import { ProfileBackLink } from "../../components/ProfileLink";
import StudentProfile from "../../components/StudentProfile";
import { getStudentProfile } from "../../data/studentProfiles";
import { getAcademicGroupByName } from "../../data/academicCatalog";
import { useRole } from "../../components/RoleContext";
import { useDashboardUpdate } from "../../data/studentDashboard";
import styles from "./index.module.scss";
import { getStudentGroupId } from "../../domain/accounts";

const StudentPage = () => {
  const { studentId } = useParams();
  const [searchParams] = useSearchParams();
  useDashboardUpdate();
  const { role, currentUser } = useRole();
  const student = getStudentProfile(studentId, searchParams.get("groupId") ?? undefined);
  const groupId = getAcademicGroupByName(student?.group)?.id;
  const canView = role === "teacher" || currentUser.id === studentId || Boolean(groupId && (getStudentGroupId(currentUser) === groupId || currentUser.memberships.some((membership) => membership.groupIds.includes(groupId))));
  const backHref = role === "student" ? (currentUser.id === studentId ? "/cabinet" : "/cabinet?tab=group") : "/journal";
  return <div className={`pageContainer ${styles.page}`}><ProfileBackLink className={styles.back} fallback={backHref} />{student && canView ? <StudentProfile student={student} /> : <section className={styles.notFound}><h1>Профиль недоступен</h1><p>Здесь доступны профили студентов вашей группы.</p><Link to={backHref}>Вернуться назад</Link></section>}</div>;
};
export default StudentPage;
