import { Link } from "react-router-dom";
import styles from "./index.module.scss";

const NotFound = () => <section className={`pageContainer ${styles.page}`}>
  <span>404</span>
  <h1>Такой страницы нет</h1>
  <p>Возможно, ссылка устарела или раздел был перемещён.</p>
  <Link to="/">Вернуться на главную</Link>
</section>;

export default NotFound;
