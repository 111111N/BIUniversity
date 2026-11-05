import type { BackupPlannerComparison, PlannerComparedField } from "../../domain/backupPlannerComparison";
import RecordComparisonReview from "./RecordComparisonReview";

const FIELD_LABELS: Record<PlannerComparedField, string> = { title: "название", text: "описание", createdAt: "день без времени / дата создания", startAt: "начало", endAt: "окончание", completed: "выполнение", priority: "приоритет", category: "категория", other: "дополнительные поля" };

export default function PlannerComparisonReview({ review }: { review: BackupPlannerComparison }) {
  return <RecordComparisonReview<PlannerComparedField> review={review} fieldLabels={FIELD_LABELS} title="Задачи планировщика по ID" recordName="Задачи" documentName="Списки" documentsCountLabel="списков" description="Здесь подсчитаны отдельные задачи внутри списков; общие итоги документов выше не изменяются." noChanges="В сравнимых списках различий задач не найдено." unavailable="Нет списков, которые удалось сравнить." listLabel="Различия задач планировщика" skippedLabel="Несравнённые списки планировщика" />;
}
