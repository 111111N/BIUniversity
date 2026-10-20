import { useState } from "react";
import FileStorage from "../../components/FileStorage";
import StudyPlan from "../../components/StudyPlan";
import Tabs from "../../components/Tabs";
import { STUDY_PLAN_TOTAL_HOURS } from "../../data/studyPlan";
import { useRole } from "../../components/RoleContext";
import { getTeacherProfile } from "../../data/teacherProfiles";
import { useNavigate } from "react-router-dom";
import styles from "./index.module.scss";

const Cabinet = () => {
  const { currentUser } = useRole();
  const navigate = useNavigate();
  const teacher = getTeacherProfile(currentUser.id);
  const groupCount = new Set(currentUser.memberships.flatMap((membership) => membership.groupIds)).size;
  const [notifications, setNotifications] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "study-plan">("overview");

  return (
    <div className={`pageContainer ${styles.page}`}>
      <Tabs ariaLabel="Разделы профиля" value={activeTab} onChange={(value) => setActiveTab(value as typeof activeTab)} items={[{ value: "overview", label: "Обзор" }, { value: "study-plan", label: "Учебный план" }]} />

      {activeTab === "study-plan" ? <StudyPlan teacher /> : <><div className={styles.dashboardGrid}>
        <section className={styles.profileCard}>
          <div className={styles.avatar}>{teacher?.initials ?? "ЕВ"}</div>
          <div>
            <h2>{currentUser.name}</h2>
            <p>{teacher ? `${teacher.position} · ${teacher.department}` : "Преподаватель"}</p>
            <span>{teacher?.email ?? "—"}</span>
            <button className={styles.editProfile} onClick={() => navigate(`/teachers/${currentUser.id}`)}>Открыть профиль</button>
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

      <FileStorage />

      <section className={styles.settingsCard}>
        <div>
          <span className={styles.cardLabel}>Настройки</span>
          <h2>Уведомления</h2>
          <p>Напоминать о ближайших занятиях и задачах планировщика.</p>
        </div>
        <button
          className={`${styles.switch} ${notifications ? styles.switchActive : ""}`}
          onClick={() => setNotifications((value) => !value)}
          role="switch"
          aria-checked={notifications}
          aria-label="Уведомления"
        ><span /></button>
      </section>
      </>}
    </div>
  );
};

export default Cabinet;
