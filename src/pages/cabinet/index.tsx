import FileStorage from "../../components/FileStorage";
import StudyPlan from "../../components/StudyPlan";
import Tabs from "../../components/Tabs";
import { STUDY_PLAN_TOTAL_HOURS } from "../../data/studyPlan";
import { useRole } from "../../components/RoleContext";
import { getTeacherProfile } from "../../data/teacherProfiles";
import { Link } from "react-router-dom";
import ProfileLink from "../../components/ProfileLink";
import CabinetSettings from "../../components/CabinetSettings";
import useCabinetTabs from "../../hooks/useCabinetTabs";
import styles from "./index.module.scss";

const Cabinet = () => {
  const { currentUser } = useRole();
  const teacher = getTeacherProfile(currentUser.id);
  const groupCount = new Set(currentUser.memberships.flatMap((membership) => membership.groupIds)).size;
  const { items, activeTab, setActiveTab } = useCabinetTabs();

  return (
    <div className={`pageContainer ${styles.page}`}>
      <Tabs className={styles.cabinetTabs} ariaLabel="Разделы профиля" value={activeTab} onChange={setActiveTab} items={items} />

      {activeTab === "study-plan" ? <StudyPlan teacher /> : activeTab === "files" ? <FileStorage /> : activeTab === "settings" ? <CabinetSettings /> : <><div className={styles.dashboardGrid}>
        <section className={styles.profileCard}>
          <div className={styles.avatar}>{teacher?.initials ?? currentUser.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div>
          <div>
            <h2>{currentUser.name}</h2>
            <p>{teacher ? `${teacher.position} · ${teacher.department}` : "Преподаватель"}</p>
            <span>{teacher?.email ?? "—"}</span>
            <ProfileLink className={styles.editProfile} to={`/teachers/${currentUser.id}`}>Открыть профиль</ProfileLink>
          </div>
        </section>

        <section className={styles.summaryCard}>
          <span className={styles.cardLabel}>Текущий семестр</span>
          <div className={styles.summaryItems}>
            <div><strong>{currentUser.memberships.length}</strong><span>дисциплины</span></div>
            <div><strong>{groupCount}</strong><span>групп</span></div>
            <div><strong>{STUDY_PLAN_TOTAL_HOURS}</strong><span>часов нагрузки</span></div>
          </div>
        </section>
      </div>

      <Link className={styles.filesShortcut} to="/cabinet?tab=files">Мои файлы <span aria-hidden="true">→</span></Link>

      </>}
    </div>
  );
};

export default Cabinet;
