import type { BackupJournalSnapshotComparison, JournalSnapshotComparedField } from "../../domain/backupJournalComparison";
import RecordComparisonReview from "./RecordComparisonReview";

const FIELDS: Record<JournalSnapshotComparedField, string> = { name: "имя студента", attendance: "отметки посещаемости", grades: "оценки", other: "дополнительные поля" };
export default function JournalSnapshotComparisonReview({ review }: { review: BackupJournalSnapshotComparison }) {
  return <RecordComparisonReview<JournalSnapshotComparedField> review={review} fieldLabels={FIELDS} title="Строки журналов по ID студентов" recordName="Строки" documentName="Снимки журналов" documentsCountLabel="снимков" description="Строки сопоставляются только внутри точного ключа с одинаковой подтверждённой учебной областью. Значения отметок и оценок доступны только в отдельном просмотре конфликта. Выбор строки требует проверки полного источника, его истории и зависимостей; смешанный журнал автоматически не создаётся." noChanges="В сравнимых снимках различий строк журнала не найдено." unavailable="Нет сравнимых снимков журналов." listLabel="Различия строк журналов" skippedLabel="Несравнённые снимки журналов" />;
}
