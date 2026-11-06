import type { BackupNotificationComparison, NotificationComparedField } from "../../domain/backupNotificationComparison";
import RecordComparisonReview from "./RecordComparisonReview";

const FIELDS: Record<NotificationComparedField, string> = { recipientUserId: "ID получателя", userId: "старое поле ID получателя", recipientRole: "сохранённая роль получателя", kind: "вид уведомления", title: "заголовок", body: "текст", href: "ссылка", createdAt: "дата создания", read: "прочитано", dedupeKey: "ключ защиты от повторов", other: "дополнительные поля" };
export default function NotificationComparisonReview({ review }: { review: BackupNotificationComparison }) {
  return <RecordComparisonReview<NotificationComparedField> review={review} fieldLabels={FIELDS} title="Уведомления по ID" recordName="Уведомления" documentName="Списки уведомлений" documentsCountLabel="списков" description="Сравниваются сохранённые уведомления с постоянными ID и явным получателем, подтверждённым учётками каждого источника. Заголовки, текст, адреса ссылок и значения полей в отчёт не включаются. Сравнение не подтверждает исторические права и доступность цели перехода." noChanges="В сравнимых списках различий уведомлений не найдено." unavailable="Нет сравнимых списков уведомлений." listLabel="Различия уведомлений" skippedLabel="Несравнённые списки уведомлений" />;
}
