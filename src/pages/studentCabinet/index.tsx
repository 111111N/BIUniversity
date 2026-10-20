import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import FileStorage from "../../components/FileStorage";
import StudyPlan from "../../components/StudyPlan";
import Tabs from "../../components/Tabs";
import MyGroup from "../../components/MyGroup";
import { useRole } from "../../components/RoleContext";
import { getAcademicGroup } from "../../data/academicCatalog";
import styles from "../studentArea.module.scss";

const StudentCabinet = () => {
  const { currentUser } = useRole();
  const navigate = useNavigate();
  const group = getAcademicGroup(currentUser.memberships[0]?.groupIds[0]);
  const [notifications, setNotifications] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab === "group" || requestedTab === "study-plan" ? requestedTab : "overview";
  const setActiveTab = (tab: string) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    return next;
  }, { replace: true });
  return (
    <div className={`pageContainer ${styles.page}`}>
      <Tabs ariaLabel="Разделы профиля" value={activeTab} onChange={setActiveTab} items={[{ value: "overview", label: "Обзор" }, { value: "group", label: "Моя группа" }, { value: "study-plan", label: "Учебный план" }]} />
      {activeTab === "study-plan" ? <StudyPlan /> : activeTab === "group" ? <MyGroup /> : <><div className={styles.grid}>
        <section className={`${styles.card} ${styles.profile}`}><div className={styles.avatar}>АС</div><div><h2>{currentUser.name}</h2><p>Студент · Прикладная математика и информатика</p><button className={`${styles.button} ${styles.profileAction}`} onClick={() => navigate(`/students/${currentUser.id}`)}>Открыть профиль</button></div></section>
        <section className={styles.card}><div className={styles.detailGrid}><div className={styles.detail}><span>Группа</span><strong>{group?.name ?? "—"}</strong></div><div className={styles.detail}><span>Курс</span><strong>{group ? `${group.course} курс` : "—"}</strong></div><div className={styles.detail}><span>Студенческий билет</span><strong>БИ-240184</strong></div><div className={styles.detail}><span>Форма обучения</span><strong>Очная</strong></div></div></section>
      </div>
      <div style={{ marginTop: 18 }}><FileStorage /></div>
      <section className={styles.card} style={{ marginTop: 18 }}><div className={styles.cardHeader}><div><span className={styles.eyebrow}>Настройки</span><h2>Уведомления о занятиях и сроках</h2></div><button className={styles.button} role="switch" aria-checked={notifications} onClick={() => setNotifications((value) => !value)}>{notifications ? "Включены" : "Выключены"}</button></div></section>
      </>}
    </div>
  );
};

export default StudentCabinet;
