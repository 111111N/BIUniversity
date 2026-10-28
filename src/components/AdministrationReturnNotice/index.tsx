import { Link, useLocation } from "react-router-dom";
import { readChecksReturn } from "../../domain/administrationChecksNavigation";
import styles from "./index.module.scss";

export default function AdministrationReturnNotice() {
  const location = useLocation();
  const returnTo = readChecksReturn(location.pathname, location.search);
  if (!returnTo) return null;
  return <aside className={styles.context} aria-label="Возврат к проверке данных"><span>Открыто из проверки данных</span><Link to={returnTo}>Вернуться к результатам</Link></aside>;
}
