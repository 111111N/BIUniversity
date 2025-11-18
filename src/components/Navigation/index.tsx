import { Link, useLocation } from "react-router-dom";
import styles from "./index.module.scss";
import {
  HomeIcon,
  ScheduleIcon,
  CabinetIcon,
  PlannerIcon,
  StatsIcon,
  LogoIcon,
} from "./icons";

export default function Nav() {
  const location = useLocation();

  const navItems = [
    { to: "/", label: "Главная", Icon: HomeIcon },
    { to: "/schedule", label: "Расписание", Icon: ScheduleIcon },
    { to: "/cabinet", label: "Кабинет", Icon: CabinetIcon },
    { to: "/planner", label: "Планировщик", Icon: PlannerIcon },
    { to: "/stats", label: "Статистика", Icon: StatsIcon },
  ];

  return (
    <nav className={styles.sidebarNav}>
      <div className={styles.navHeader}>
        <LogoIcon className={styles.logoImage} />
      </div>

      <ul className={styles.navList}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;

          return (
            <li
              key={item.to}
              className={`${styles.navItem} ${isActive ? styles.active : ""}`}
            >
              <Link to={item.to} className={styles.navLink}>
                <item.Icon className={styles.icon} />
                <span className={styles.text}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
