import { ACCOUNT_ROLE_LABELS, isAccountActive, type PortalAccount } from "../../domain/accounts";
import styles from "./AccountAccess.module.scss";

interface Props { account: PortalAccount; blockRestriction: string; busy: boolean; unavailable: boolean; stale: boolean; onStatus(): void; onRole(): void; onReset(): void }
export default function AccountAccess({ account, blockRestriction, busy, unavailable, stale, onStatus, onRole, onReset }: Props) {
  const active = isAccountActive(account);
  return <div className={styles.workspace}>
    <section className={styles.status} aria-label="Доступ к кабинету"><div><h3>Доступ к кабинету</h3><strong className={active ? styles.active : styles.blocked}>{active ? "Вход открыт" : "Вход заблокирован"}</strong><p>Управление входом не меняет состояние обучения и не удаляет данные.</p>{active && blockRestriction && <p id="account-block-restriction" className={styles.restriction}>{blockRestriction}</p>}</div><button className={active ? styles.blockButton : styles.primary} type="button" disabled={busy || unavailable || stale || (active && Boolean(blockRestriction))} aria-describedby={active && blockRestriction ? "account-block-restriction" : undefined} onClick={onStatus}>{active ? "Заблокировать вход" : "Восстановить доступ"}</button></section>
    <div className={styles.secondary}>
      <section className={styles.card}><div><h3>Тип учётной записи</h3><strong>{ACCOUNT_ROLE_LABELS[account.role]}</strong><p>Определяет доступные разделы и права пользователя.</p></div><button type="button" disabled={busy || unavailable || stale} onClick={onRole}>Изменить тип</button></section>
      <section className={styles.card}><div><h3>Сброс пароля</h3><strong>Пока недоступен</strong><p>Сервер авторизации ещё не подключён. Можно посмотреть получателя и будущий сценарий сброса.</p></div><button type="button" disabled={busy} onClick={onReset}>Посмотреть сброс пароля</button></section>
    </div>
  </div>;
}
