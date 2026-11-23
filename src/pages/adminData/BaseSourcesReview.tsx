import type { BaseSelectionReview } from "../../domain/backupBaseSelection";
import styles from "./index.module.scss";

export default function BaseSourcesReview({ reviews, title = "Базовые источники", showKeys = false, settings = false }: { reviews: readonly BaseSelectionReview[]; title?: string; showKeys?: boolean; settings?: boolean }) {
  return <section className={styles.baseSources} aria-label={title}><h3>{title}</h3>
    <p className={styles.hint}>{settings ? "Сверяем сохранённые тему и виды интерфейса. Для различающихся значений нужен выбор после просмотра; односторонние настройки сохраняются." : "Проверяем, соответствует ли выбранным записям один полный сохранённый документ. Счётчики и служебные сведения не объединяются; записи только из другого источника сохраняются."}</p>
    {reviews.map(review => <article key={review.key} className={styles.baseSource}>
      <h4>{review.label}</h4>
      {showKeys && <p className={styles.hint}>{review.key}</p>}
      <p>{review.status === "absent" ? settings ? "Отсутствует в обоих источниках. Значение по умолчанию не подставлялось." : "Отсутствует в обоих источниках. Пустой документ не создавался." : review.status === "matched" ? `${settings ? "Значение соответствует выбору" : "Полный источник соответствует выбору записей"}: ${review.source === "both" ? "источники совпадают" : review.source === "browser" ? "этот браузер" : "архив"}.` : settings ? "Значение пока не подтверждено." : "Полный источник пока не подтверждён."}</p>
      {review.issues.length > 0 && <ul>{review.issues.map(issue => <li key={issue.code}>{issue.message}</li>)}</ul>}
      {review.status !== "absent" && <p className={styles.hint}>{review.countsComplete ? `Конфликтов: ${review.counts.conflicts} · Без выбора: ${review.counts.unresolved} · Только в архиве: ${review.counts.archiveOnly} · Только в браузере: ${review.counts.browserOnly}` : "Полные счётчики не получены: проверка остановлена."}</p>}
    </article>)}
    <p className={styles.hint}>{settings ? "Настройки не применялись. Владелец вида расписания проверяется отдельно по выбранным учёткам; исторические права этим не подтверждаются." : "Соответствие полному источнику не подтверждает исторические права и все связи между документами. Проверка ничего не восстанавливает."}</p>
  </section>;
}
