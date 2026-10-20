import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import styles from "./index.module.scss";
import {
  HomeIcon,
  ScheduleIcon,
  CabinetIcon,
  JournalIcon,
  PlannerIcon,
  StatsIcon,
  LogoIcon,
  MessagesIcon,
  NotificationsIcon,
} from "./icons";
import RoleSwitcher from "../RoleSwitcher";
import { useRole } from "../RoleContext";
import { useNotificationSummary } from "../Notifications/useNotifications";
import { useTheme } from "../ThemeContext";

const NotificationsPopup = lazy(() => import("../Notifications/Popup"));

export default function Nav() {
  const location = useLocation();
  const { role } = useRole();
  const { theme, toggleTheme } = useTheme();
  const { total: notificationCount, unread: unreadNotifications, error: notificationError } = useNotificationSummary();
  const showNotifications = notificationCount > 0 || Boolean(notificationError);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const notificationId = useId();
  const [, setSearchParams] = useSearchParams();
  const consumedLocation = useRef<string | null>(null);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);

  useEffect(() => {
    if (!showNotifications) setNotificationsOpen(false);
  }, [showNotifications]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("notifications") === "open") {
      setNotificationsOpen(notificationButtonRef.current !== null);
      params.delete("notifications");
      const search = params.toString();
      consumedLocation.current = `${location.pathname}${search ? `?${search}` : ""}${location.hash}`;
      setSearchParams(params, { replace: true });
      return;
    }
    const nextLocation = `${location.pathname}${location.search}${location.hash}`;
    if (consumedLocation.current === nextLocation) { consumedLocation.current = null; return; }
    consumedLocation.current = null;
    setNotificationsOpen(false);
  }, [location, role, setSearchParams]);

  const teacherItems = [
    { to: "/", label: "Главная", Icon: HomeIcon },
    { to: "/schedule", label: "Расписание", Icon: ScheduleIcon },
    { to: "/planner", label: "Планировщик", Icon: PlannerIcon },
    { to: "/journal", activePath: "/journal", label: "Журнал", Icon: JournalIcon },
    { to: "/stats", label: "Статистика", Icon: StatsIcon },
    { to: "/messages", label: "Сообщения", Icon: MessagesIcon },
  ];
  const studentItems = [
    { to: "/", label: "Главная", Icon: HomeIcon },
    { to: "/schedule", label: "Расписание", Icon: ScheduleIcon },
    { to: "/journal", activePath: "/journal", label: "Журнал", Icon: JournalIcon },
    { to: "/messages", label: "Сообщения", Icon: MessagesIcon },
  ];
  const navItems = role === "student" ? studentItems : teacherItems;
  const cabinetItem = { to: "/cabinet", label: role === "student" ? "Профиль" : "Кабинет", Icon: CabinetIcon };

  const renderItem = (item: typeof cabinetItem) => {
    const isActive = location.pathname === item.to || ("activePath" in item && location.pathname.startsWith(String(item.activePath)));
    return <li key={item.to} className={`${styles.navItem} ${isActive && item.to !== cabinetItem.to ? styles.active : ""}`}><Link to={item.to} className={styles.navLink} aria-current={isActive ? "page" : undefined}><item.Icon className={styles.icon} aria-hidden="true"/><span className={styles.text}>{item.label}</span></Link></li>;
  };

  return (
    <nav className={styles.sidebarNav} aria-label="Основные разделы">
      <div className={styles.navHeader}>
        <button
          type="button"
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
          aria-pressed={theme === "light"}
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        >
          <LogoIcon className={styles.logoImage} />
        </button>
      </div>

      <ul className={styles.navList}>{navItems.map(renderItem)}</ul>
      <div className={styles.bottomNav}>
        <RoleSwitcher />
        <div className={`${styles.profileRow} ${location.pathname === cabinetItem.to ? styles.profileActive : ""}`}>
          <ul className={styles.navList}>{renderItem(cabinetItem)}</ul>
          {showNotifications && <button ref={notificationButtonRef} type="button" className={`${styles.notificationsButton} ${notificationsOpen ? styles.notificationsOpen : ""}`} aria-label={notificationError ? "Уведомления недоступны — открыть восстановление чтения" : unreadNotifications ? `Уведомления: ${unreadNotifications} непрочитанных` : "Уведомления — всё прочитано"} aria-haspopup="dialog" aria-expanded={notificationsOpen} aria-controls={notificationsOpen ? notificationId : undefined} onClick={() => setNotificationsOpen((open) => !open)} title={notificationError ? "Ошибка чтения уведомлений" : "Уведомления"}>
            <NotificationsIcon aria-hidden="true" />
            {notificationError ? <span className={styles.badge} aria-hidden="true">!</span> : unreadNotifications > 0 && <span className={styles.badge} aria-hidden="true">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
          </button>}
        </div>
      </div>
      {showNotifications && notificationsOpen && <Suspense fallback={null}><NotificationsPopup key={role} id={notificationId} anchorRef={notificationButtonRef} onClose={closeNotifications} /></Suspense>}
    </nav>
  );
}
