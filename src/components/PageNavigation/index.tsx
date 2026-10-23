import { useEffect, type MouseEvent } from "react";
import { useLocation } from "react-router-dom";
import { useRole } from "../RoleContext";
import { getPortalPageTitle } from "../../domain/pageTitle";
import styles from "./index.module.scss";

export default function PageNavigation() {
  const { pathname } = useLocation();
  const { role } = useRole();
  useEffect(() => {
    try { document.title = getPortalPageTitle(pathname, role); }
    catch (error) { console.error("Не удалось обновить название вкладки портала:", error); }
  }, [pathname, role]);
  const skipNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      const main = document.getElementById("main-content");
      if (!main) throw new Error("Основная область страницы не найдена");
      main.focus({ preventScroll: true });
      main.scrollIntoView({ block: "start", behavior: "instant" });
    } catch (error) { console.error("Не удалось перейти к содержимому страницы:", error); }
  };
  return <a className={styles.skipLink} href="#main-content" onClick={skipNavigation}>Перейти к содержимому</a>;
}
