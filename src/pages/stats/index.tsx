import TeacherStatistics from "../../components/TeacherStatistics";
import styles from "./index.module.scss";

const Stats = () => (
  <div className={`pageContainer ${styles.page}`}>
    <TeacherStatistics />
  </div>
);

export default Stats;
