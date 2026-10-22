import { useParams } from "react-router-dom";
import { ProfileBackLink } from "../../components/ProfileLink";
import TeacherProfile from "../../components/TeacherProfile";
import { useRole } from "../../components/RoleContext";
import { getTeacherProfile } from "../../data/teacherProfiles";
import styles from "./index.module.scss";

const TeacherPage = () => {
  const { teacherId } = useParams();
  const { currentUser } = useRole();
  const teacher = getTeacherProfile(teacherId);
  const ownProfile = teacherId === currentUser.id;
  return <div className={`pageContainer ${styles.page}`}>
    <ProfileBackLink className={styles.back} fallback={ownProfile ? "/cabinet" : "/messages"} />
    {teacher ? <TeacherProfile teacher={teacher} /> : <section className={styles.empty}><h1>Преподаватель не найден</h1></section>}
  </div>;
};

export default TeacherPage;
