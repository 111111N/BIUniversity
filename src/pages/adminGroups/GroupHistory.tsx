import { useMemo } from "react";
import { isGroupActive, type GroupChange, type GroupValues } from "../../domain/groupCatalog";
import { getGroupHistoryPage } from "./presentation";
import styles from "./GroupHistory.module.scss";

const Values = ({ value }: { value: GroupValues }) => <dl><div><dt>Название</dt><dd>{value.name}</dd></div><div><dt>Курс</dt><dd>{value.course}</dd></div><div><dt>Корпус</dt><dd>{value.campus ?? "Не указан"}</dd></div><div><dt>Год набора</dt><dd>{value.admissionYear ?? "Не указан"}</dd></div><div><dt>Состояние</dt><dd>{isGroupActive(value) ? "Действующая" : "В архиве"}</dd></div></dl>;

interface Props { entries: GroupChange[]; accounts: { id: string; name: string }[]; requestedPage: string | null; unavailable?: boolean; onPage(page: number): void }
export default function GroupHistory({ entries, accounts, requestedPage, unavailable, onPage }: Props) {
  const authors = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const listing = getGroupHistoryPage(entries, requestedPage);
  if (unavailable) return <div className={styles.empty} role="status"><strong>История временно недоступна</strong><p>Повторите чтение данных кнопкой выше.</p></div>;
  if (!entries.length) return <div className={styles.empty}><strong>Истории изменений пока нет</strong><p>Здесь появятся создание, изменение реквизитов, архивирование и восстановление группы.</p></div>;
  return <section className={styles.history} aria-label="История изменений учебной группы">
    <p className={styles.results} role="status">Событий: {entries.length} · {listing.start + 1}–{listing.start + listing.entries.length}</p>
    <ol start={listing.start + 1}>{listing.entries.map((entry) => <li key={entry.id}>
      <strong>{{ created: "Группа создана", updated: "Изменены реквизиты", archived: "Группа в архиве", restored: "Группа восстановлена" }[entry.action]}</strong>
      <div className={styles.meta}><time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} мск</time><span>{authors.get(entry.actorId) ?? entry.actorId}</span></div>
      {(entry.before || entry.after) && <details><summary>Показать изменения</summary><div className={styles.comparison}>{entry.before && <section aria-label="Реквизиты до изменения"><h3>Было</h3><Values value={entry.before} /></section>}{entry.after && <section aria-label="Реквизиты после изменения"><h3>Стало</h3><Values value={entry.after} /></section>}</div></details>}
    </li>)}</ol>
    {listing.pages > 1 && <nav className={styles.pagination} aria-label="Страницы истории группы"><button type="button" disabled={listing.page === 1} onClick={() => onPage(listing.page - 1)}>Назад</button><span>{listing.page} / {listing.pages}</span><button type="button" disabled={listing.page === listing.pages} onClick={() => onPage(listing.page + 1)}>Далее</button></nav>}
  </section>;
}
