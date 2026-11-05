import type { BackupCatalogComparison, GroupComparedField, SubjectComparedField } from "../../domain/backupCatalogComparison";
import RecordComparisonReview from "./RecordComparisonReview";
import styles from "./index.module.scss";

const GROUP_FIELDS: Record<GroupComparedField, string> = { name: "название", course: "курс", campus: "корпус", admissionYear: "год набора", status: "состояние", previousNames: "прежние названия", revision: "ревизия карточки", createdAt: "дата создания", createdBy: "автор создания", updatedAt: "дата изменения", source: "происхождение", other: "дополнительные поля" };
const SUBJECT_FIELDS: Record<SubjectComparedField, string> = { name: "название", shortName: "сокращение", semester: "семестр", color: "цвет", other: "дополнительные поля" };

export default function CatalogComparisonReview({ review }: { review: BackupCatalogComparison }) {
  const documents = review.groups.counts.documents + review.subjects.counts.documents;
  const unchecked = review.groups.counts.uncheckedDocuments + review.subjects.counts.uncheckedDocuments;
  if (!documents) return null;
  return <details className={styles.details}><summary>Карточки групп и дисциплин по ID · каталогов {documents}{unchecked ? ` · не сравнено ${unchecked}` : ""}</summary><div className={styles.catalogComparisonBody}>
    <p className={styles.hint}>Здесь сравниваются сохранённые карточки. История, ревизии самих каталогов и остальные свойства документов остаются в общем сравнении выше. Совпадение карточек не означает совпадение этих документов целиком. Встроенные примеры не подставляются.</p>
    <RecordComparisonReview<GroupComparedField> review={review.groups} fieldLabels={GROUP_FIELDS} title="Группы по ID" recordName="Группы" documentName="Каталоги" documentsCountLabel="каталогов" description="Подсчитаны карточки групп; история каталога сюда не входит." noChanges="В сравнимых каталогах различий карточек групп не найдено." unavailable="Нет каталогов групп, которые удалось сравнить." listLabel="Различия карточек групп" skippedLabel="Несравнённые каталоги групп" />
    <RecordComparisonReview<SubjectComparedField> review={review.subjects} fieldLabels={SUBJECT_FIELDS} title="Дисциплины по ID" recordName="Дисциплины" documentName="Каталоги" documentsCountLabel="каталогов" description="Подсчитаны карточки дисциплин; история каталога сюда не входит." noChanges="В сравнимых каталогах различий карточек дисциплин не найдено." unavailable="Нет каталогов дисциплин, которые удалось сравнить." listLabel="Различия карточек дисциплин" skippedLabel="Несравнённые каталоги дисциплин" />
  </div></details>;
}
