import styles from "./index.module.scss";

const CabinetSettings = () => <section className={styles.card} aria-labelledby="reminder-settings-title">
  <div><h2 id="reminder-settings-title">Напоминания о занятиях и сроках</h2><p>Настройка напоминаний пока недоступна. История событий кабинета открывается через кнопку уведомлений в меню.</p></div>
  <span className={styles.status}>Пока недоступно</span>
</section>;

export default CabinetSettings;
