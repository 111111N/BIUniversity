import type { AccountComparedField, BackupAccountComparison } from "../../domain/backupAccountComparison";
import RecordComparisonReview from "./RecordComparisonReview";

const FIELDS: Record<AccountComparedField, string> = { name: "ФИО", login: "логин", role: "тип учётки", status: "доступ ко входу", email: "почта", scheduleName: "имя в расписании", memberships: "учебные назначения", studentGroupId: "учебная группа", enrollmentStatus: "состояние обучения", studentRecord: "реквизиты зачётки", revision: "ревизия учётки", createdAt: "дата создания", updatedAt: "дата изменения", other: "дополнительные поля" };

export default function AccountComparisonReview({ review }: { review: BackupAccountComparison }) {
  return <RecordComparisonReview<AccountComparedField> review={review} fieldLabels={FIELDS} title="Учётные записи по ID" recordName="Учётные записи" documentName="Документы" documentsCountLabel="документов" description="Подсчитаны карточки учёток. ФИО, логины, почта и номера зачёток в этот отчёт не включаются. История, учебные события, пакеты операций, счётчики и свойства документа остаются в общем сравнении выше. Совпадение карточек не подтверждает право входа или управления системой." noChanges="В сравнимых документах различий карточек учёток не найдено." unavailable="Нет документов учёток, которые удалось сравнить." listLabel="Различия карточек учётных записей" skippedLabel="Несравнённые документы учёток" />;
}
