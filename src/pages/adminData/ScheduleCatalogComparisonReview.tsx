import { getUncheckedScheduleCatalogDocuments, SCHEDULE_CATALOG_COMPARISON_LABELS, SCHEDULE_CATALOG_SECTIONS, type BackupScheduleCatalogComparison, type ScheduleCatalogSection } from "../../domain/backupScheduleCatalogComparison";
import RecordComparisonReview from "./RecordComparisonReview";
import styles from "./index.module.scss";

const labels: Record<ScheduleCatalogSection, { title: string; description: string }> = {
  rooms: { title: "Карточки аудиторий по ID", description: "Корпус, вместимость, оснащение, прежние названия и состояние сравниваются как сохранены. Аудитории с разными ID не объединяются по номеру." },
  roomHistory: { title: "История аудиторий по ID событий", description: "Сравниваются автор, дата и полные снимки до/после. События не достраиваются из карточек; совпадение не подтверждает полномочия автора." },
  templates: { title: "Шаблоны расписания по ID", description: "Название, состояние и ссылка на точную публикацию сравниваются отдельно от истории. Наличие ID не подтверждает совместимость выбранного источника." },
  templateHistory: { title: "История шаблонов по ID событий", description: "Сравниваются сохранённые события с полными снимками до/после. Порядок истории и ревизия документа дополнительно видны в общем сравнении." },
  publications: { title: "Архив публикаций по ID версий", description: "Сравнивается полная сохранённая неделя внутри версии вместе с номером, происхождением, датой и автором. Изменение пары не теряется при одинаковом числе занятий; ранние отсутствующие версии не создаются." },
};
export default function ScheduleCatalogComparisonReview({ review }: { review: BackupScheduleCatalogComparison }) {
  const documents = review.rooms.counts.documents + review.templates.counts.documents + review.publications.counts.documents;
  if (!documents) return null;
  const unchecked = getUncheckedScheduleCatalogDocuments(review);
  return <details className={styles.details}><summary>Аудитории, шаблоны и архив публикаций · документов {documents}{unchecked ? ` · не сравнено ${unchecked}` : ""}</summary><div className={styles.catalogComparisonBody}>
    <p className={styles.hint}>Карточки и история сравниваются отдельно по постоянным ID. Метаданные и ревизии документов остаются в общем сравнении. Значения полей в отчёт не включаются; подтверждённый конфликт можно открыть отдельно. Выбор версии сохраняется для проверки и не восстанавливает данные.</p>
    {SCHEDULE_CATALOG_SECTIONS.map(section => <RecordComparisonReview key={section} review={review[section]} fieldLabels={SCHEDULE_CATALOG_COMPARISON_LABELS} title={labels[section].title} recordName="Записи" documentName="Документы" documentsCountLabel="документов" description={labels[section].description} noChanges="В сравнимых источниках различий записей не найдено." unavailable="Нет источников, которые удалось полностью прочитать и сравнить." listLabel={labels[section].title} skippedLabel="Несравнённые документы" />)}
  </div></details>;
}
