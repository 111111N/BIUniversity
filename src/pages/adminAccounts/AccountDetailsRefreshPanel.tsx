import { useEffect, useRef } from "react";
import { ACCOUNT_ROLE_LABELS, isAccountActive } from "../../domain/accounts";
import { getAccountDetailsComparison, type AccountDetailsEditor, type AccountDetailsReview } from "./accountDetailsRefresh";
import styles from "./AccountDetailsRefreshPanel.module.scss";

interface Props {
  editor: AccountDetailsEditor; review: AccountDetailsReview; stale: boolean; disabled: boolean; busy: boolean;
  onRefresh(): void; onChoose(choice: "mine" | "saved"): void; onCancel(): void;
}
const labels = { name: "Имя и фамилия", login: "Логин", email: "Электронная почта" };
export default function AccountDetailsRefreshPanel({ editor, review, stale, disabled, busy, onRefresh, onChoose, onCancel }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  return <section className={styles.panel} aria-label="Сравнение личных данных учётки">
    <h3 ref={headingRef} tabIndex={-1}>Карточка изменилась</h3>
    <p>Сравните свой ввод с актуальными данными. Можно оставить только свои изменённые поля, сохранив остальные обновления. Выбор вернёт к форме; запись выполняется отдельно.</p>
    <dl className={styles.comparison}>{getAccountDetailsComparison(editor, review).map((row) => <div key={row.field} className={row.conflict ? styles.conflict : ""}>
      <dt>{labels[row.field]}<span>{row.conflict ? "Изменено с двух сторон" : row.changedHere ? "Ваше изменение" : row.changedElsewhere ? "Обновлено в другой вкладке" : "Без изменений"}</span></dt>
      <dd><span>Мой ввод</span><strong>{row.mine || "Не указано"}</strong></dd>
      <dd><span>Сейчас сохранено</span><strong>{row.saved || "Не указано"}</strong></dd>
    </div>)}</dl>
    <p>Сейчас: <strong>{ACCOUNT_ROLE_LABELS[review.latest.role]} · {isAccountActive(review.latest) ? "Вход открыт" : "Вход заблокирован"}</strong>. Тип, доступ, группа и зачетка берутся из актуальной карточки.</p>
    {stale && <p className={styles.error} role="alert">Данные или права снова изменились. Обновите сравнение перед выбором; ваш ввод сохранён.</p>}
    <div className={styles.actions}>
      <button className={styles.primary} type="button" disabled={disabled || stale} onClick={() => onChoose("mine")}>Продолжить с моими правками</button>
      <button type="button" disabled={disabled || stale} onClick={() => onChoose("saved")}>Загрузить сохранённые данные</button>
      {stale && <button type="button" disabled={disabled} onClick={onRefresh}>Обновить сравнение</button>}
      <button type="button" disabled={busy} onClick={onCancel}>К моему вводу</button>
    </div>
  </section>;
}
