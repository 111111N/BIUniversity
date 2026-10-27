import Modal from "../../components/Modal";
import { useId, useRef } from "react";
import { isAccountActive, type PortalAccount } from "../../domain/accounts";
import styles from "./index.module.scss";

const PasswordResetDialog = ({ account, onClose, onEditEmail }: { account: PortalAccount; onClose(): void; onEditEmail(): void }) => {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  return <Modal labelledBy={`${id}-title`} initialFocusRef={closeRef} onClose={onClose} className={styles.resetDialog}>
  <h2 id={`${id}-title`}>Сброс пароля</h2>
  <p><strong>{account.name}</strong><br />{account.login}</p>
  <div className={styles.securityNote}>
    <strong>Сервер авторизации не подключён</strong>
    <p id={`${id}-availability`}>Отправка ссылки для смены пароля станет доступна после подключения сервера. Сейчас это окно показывает будущий сценарий сброса.</p>
  </div>
  <dl className={styles.resetDetails}><div><dt>Получатель</dt><dd>{account.email || "Электронная почта не указана"}</dd></div><div><dt>После сброса</dt><dd>Пользователь задаёт новый пароль по одноразовой ссылке.</dd></div></dl>
  {!isAccountActive(account) && <p>Вход заблокирован. Сброс пароля и восстановление доступа — отдельные действия.</p>}
  <button type="button" onClick={onEditEmail}>{account.email ? "Изменить почту в данных учётки" : "Добавить почту в данных учётки"}</button>
  <div className={styles.dialogActions}><button ref={closeRef} type="button" onClick={onClose}>Закрыть</button><button type="button" className={styles.primary} disabled aria-describedby={`${id}-availability`}>Отправить ссылку</button></div>
</Modal>;
};
export default PasswordResetDialog;
