import { Link } from "react-router-dom";
import FileStorage from "../../components/FileStorage";
import StudyPlan from "../../components/StudyPlan";
import Tabs from "../../components/Tabs";
import MyGroup from "../../components/MyGroup";
import ProfileLink from "../../components/ProfileLink";
import CabinetSettings from "../../components/CabinetSettings";
import useCabinetTabs from "../../hooks/useCabinetTabs";
import { useRole } from "../../components/RoleContext";
import { getAcademicGroup } from "../../data/academicCatalog";
import { getStudentProfile } from "../../data/studentProfiles";
import { useDashboardUpdate } from "../../data/studentDashboard";
import styles from "../cabinet/index.module.scss";
import { getStudentGroupId } from "../../domain/accounts";

const StudentCabinet = () => {
  const { currentUser } = useRole();
  useDashboardUpdate();
  const groupId = getStudentGroupId(currentUser);
  const group = getAcademicGroup(groupId);
  const student = getStudentProfile(currentUser.id, groupId);
  const { items, activeTab, setActiveTab } = useCabinetTabs(true);
  return <div className={`pageContainer ${styles.page}`}>
    <Tabs className={styles.cabinetTabs} ariaLabel="Разделы профиля" value={activeTab} onChange={setActiveTab} items={items} />
    {activeTab === "study-plan" ? <StudyPlan /> : activeTab === "group" ? <MyGroup /> : activeTab === "files" ? <FileStorage /> : activeTab === "settings" ? <CabinetSettings /> : <>
      <div className={styles.dashboardGrid}>
        <section className={styles.profileCard}>
          <div className={styles.avatar} aria-hidden="true">{student?.initials ?? currentUser.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div>
          <div><h2>{student?.name ?? currentUser.name}</h2><p>Студент{group ? ` · ${group.name}` : ""}</p><span>{student?.email ?? "Почта не указана"}</span><ProfileLink className={styles.editProfile} to={`/students/${currentUser.id}?groupId=${groupId ?? ""}`}>Открыть профиль</ProfileLink></div>
        </section>
        <section className={styles.summaryCard} aria-label="Учебные сведения">
          <div className={styles.detailGrid}>
            <div><span>Группа</span><strong>{group?.name ?? "Не указано"}</strong></div>
            <div><span>Курс</span><strong>{group ? `${group.course} курс` : "Не указано"}</strong></div>
            <div><span>Номер зачетки</span><strong>{currentUser.studentRecord?.number ?? "Не выдан"}</strong></div>
            <div><span>Учебный корпус</span><strong>{currentUser.studentRecord ? `Корпус ${currentUser.studentRecord.campus}` : "Не указан"}</strong></div>
            <div><span>Форма обучения</span><strong>Не указано</strong></div>
          </div>
        </section>
      </div>
      <Link className={styles.filesShortcut} to="/cabinet?tab=files">Мои файлы <span aria-hidden="true">→</span></Link>
    </>}
  </div>;
};

export default StudentCabinet;
