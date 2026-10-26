import Modal from "../../components/Modal";
import type { PortalAccount } from "../../domain/accounts";
import styles from "./index.module.scss";

const PasswordResetDialog = ({ account, onClose, onEditEmail }: { account: PortalAccount; onClose(): void; onEditEmail(): void }) => <Modal labelledBy="password-reset-title" onClose={onClose} className={styles.resetDialog}>
  <h2 id="password-reset-title">Сброс пароля</h2>
  <p><strong>{account.name}</strong><br />{account.login}</p>
  <div className={styles.securityNote}>
    <strong>Сервер авторизации не подключён</strong>
    <p id="password-reset-availability">Отправка ссылки для смены пароля станет доступна после подключения сервера. Сейчас это окно показывает будущий сценарий сброса.</p>
  </div>
  <dl className={styles.resetDetails}><div><dt>Получатель</dt><dd>{account.email || "Электронная почта не указана"}</dd></div><div><dt>После сброса</dt><dd>Пользователь задаёт новый пароль по одноразовой ссылке.</dd></div></dl>
  {!account.email && <button type="button" onClick={onEditEmail}>Добавить почту в данных учётки</button>}
  <div className={styles.dialogActions}><button type="button" onClick={onClose}>Закрыть</button><button type="button" className={styles.primary} disabled aria-describedby="password-reset-availability">Отправить ссылку</button></div>
</Modal>;
export default PasswordResetDialog;
