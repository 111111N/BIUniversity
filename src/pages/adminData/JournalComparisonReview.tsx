import type { BackupJournalComparison, JournalHistoryComparedField } from "../../domain/backupJournalComparison";
import RecordComparisonReview from "./RecordComparisonReview";

const FIELDS: Record<JournalHistoryComparedField, string> = { changedAt: "дата изменения", actor: "сохранённый автор", studentId: "ID студента", studentName: "имя студента", lessonId: "ID занятия", field: "тип изменения", previousValue: "прежнее значение", nextValue: "новое значение", other: "дополнительные поля" };
export default function JournalComparisonReview({ review }: { review: BackupJournalComparison }) {
  return <RecordComparisonReview<JournalHistoryComparedField> review={review} fieldLabels={FIELDS} title="История журналов по ID событий" recordName="События" documentName="Источники истории" documentsCountLabel="списков" description="События сопоставляются только внутри точного ключа с подтверждённой одинаковой учебной областью. Оценки, отметки, имена и данные автора не включаются в отчёт. Сравнение не подтверждает исторический состав группы, права или согласованность с текущим журналом." noChanges="В сравнимых источниках различий событий журнала не найдено." unavailable="Нет сравнимых источников истории журнала." listLabel="Различия событий истории журналов" skippedLabel="Несравнённые источники истории журналов" />;
}
