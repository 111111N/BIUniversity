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
import Modal from "../Modal";
import { useRole } from "../RoleContext";
import { useNotificationSummary } from "../Notifications/useNotifications";
import { useTheme } from "../ThemeContext";

const NotificationsPopup = lazy(() => import("../Notifications/Popup"));

export default function Nav() {
  const location = useLocation();
  const { role } = useRole();
  const { theme, toggleTheme } = useTheme();
  const { unread: unreadNotifications, error: notificationError } = useNotificationSummary();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreCloseRef = useRef<HTMLButtonElement>(null);
  const moreId = useId();
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const notificationId = useId();
  const [, setSearchParams] = useSearchParams();
  const consumedLocation = useRef<string | null>(null);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);

  useEffect(() => {
    setMoreOpen(false);
  }, [location, role]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const closeOnDesktop = () => { if (!media.matches) setMoreOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

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
  const mobileItems = studentItems;
  const extraItems = navItems.filter((item) => !mobileItems.some((mobile) => mobile.to === item.to));
  const cabinetItem = { to: "/cabinet", label: role === "student" ? "Профиль" : "Кабинет", Icon: CabinetIcon };
  const moreActive = location.pathname === "/cabinet" || extraItems.some((item) => location.pathname === item.to);
  const notificationLabel = notificationError ? "Уведомления недоступны — открыть восстановление чтения" : unreadNotifications ? `Уведомления: ${unreadNotifications} непрочитанных` : "Уведомления — всё прочитано";
  const notificationBadge = notificationError ? "!" : unreadNotifications > 99 ? "99+" : unreadNotifications || null;

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

      <ul className={`${styles.navList} ${styles.desktopList}`}>{navItems.map(renderItem)}</ul>
      <div className={styles.bottomNav}>
        <RoleSwitcher />
        <div className={`${styles.profileRow} ${location.pathname === cabinetItem.to ? styles.profileActive : ""}`}>
          <ul className={styles.navList}>{renderItem(cabinetItem)}</ul>
          <button ref={notificationButtonRef} type="button" className={`${styles.notificationsButton} ${notificationsOpen ? styles.notificationsOpen : ""}`} aria-label={notificationLabel} aria-haspopup="dialog" aria-expanded={notificationsOpen} aria-controls={notificationsOpen ? notificationId : undefined} onClick={() => setNotificationsOpen((open) => !open)} title={notificationError ? "Ошибка чтения уведомлений" : "Уведомления"}>
            <NotificationsIcon aria-hidden="true" />
            {notificationError ? <span className={styles.badge} aria-hidden="true">!</span> : unreadNotifications > 0 && <span className={styles.badge} aria-hidden="true">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
          </button>
        </div>
      </div>
      <ul className={`${styles.navList} ${styles.mobileList}`}>
        {mobileItems.map(renderItem)}
        <li className={`${styles.navItem} ${moreActive ? styles.active : ""}`}><button ref={moreButtonRef} type="button" className={styles.moreButton} aria-label="Другие разделы" aria-haspopup="dialog" aria-expanded={moreOpen} aria-controls={moreOpen ? moreId : undefined} onClick={() => setMoreOpen(true)}>
          <svg className={styles.icon} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="16" cy="10" r="1.6"/></svg><span>Ещё</span>{notificationBadge && <span className={styles.badge} aria-label={`${notificationBadge} новых уведомлений`}>{notificationBadge}</span>}
        </button></li>
      </ul>
      {moreOpen && <Modal labelledBy={`${moreId}-title`} initialFocusRef={moreCloseRef} onClose={() => setMoreOpen(false)} className={styles.morePanel}>
        <header className={styles.moreHeading}><h2 id={`${moreId}-title`}>Ещё</h2><button ref={moreCloseRef} type="button" aria-label="Закрыть меню" onClick={() => setMoreOpen(false)}>×</button></header>
        <div id={moreId} className={styles.moreContent}>
          <ul className={styles.extraList}>{[...extraItems, cabinetItem].map(renderItem)}</ul>
          <button type="button" className={styles.moreAction} onClick={() => { setMoreOpen(false); setNotificationsOpen(true); }}><NotificationsIcon className={styles.icon} aria-hidden="true"/><span>Уведомления</span>{notificationBadge && <strong>{notificationBadge}</strong>}</button>
          <button type="button" className={styles.moreAction} onClick={toggleTheme}><svg className={styles.icon} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{theme === "dark" ? <><circle cx="10" cy="10" r="3.5"/><path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.6 3.6 5 5m10 10 1.4 1.4M3.6 16.4 5 15M15 5l1.4-1.4"/></> : <path d="M16.9 12.6A7.5 7.5 0 0 1 7.4 3.1 7.5 7.5 0 1 0 16.9 12.6Z"/>}</svg><span>{theme === "dark" ? "Светлая тема" : "Тёмная тема"}</span></button>
          <RoleSwitcher />
        </div>
      </Modal>}
      {notificationsOpen && <Suspense fallback={null}><NotificationsPopup key={role} id={notificationId} anchorRef={notificationButtonRef} onClose={closeNotifications} /></Suspense>}
    </nav>
  );
}
