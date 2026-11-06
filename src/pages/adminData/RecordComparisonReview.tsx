import type { BackupRecordComparison, BackupUncomparedDocument } from "../../domain/backupRecordComparison";
import { getBackupDifferenceKey, type BackupDifference } from "../../domain/backupComparison";
import DifferenceReview from "./DifferenceReview";
import styles from "./index.module.scss";

interface Props<Field extends string> {
  review: BackupRecordComparison<Field>; fieldLabels: Record<Field | "other", string>;
  title: string; recordName: string; documentName: string; documentsCountLabel: string;
  description: string; noChanges: string; unavailable: string; listLabel: string; skippedLabel: string;
}
const REASONS: Record<BackupUncomparedDocument["reason"], string> = {
  "unsupported-key": "Формат или версия ключа не поддерживаются либо неоднозначны. Документ не объединён с другим.",
  "duplicate-key": "Ключ документа повторяется в источнике. Версия не выбрана.",
  "invalid-document": "Документ повреждён, содержит противоречия или неоднозначные ID. Он не считается пустым; записи не отброшены.",
  "missing-history": "История попыток отсутствует или пуста. Полнота не подтверждена; попытки не создавались. Этот источник не считается пустой историей.",
  "missing-education-history": "В старом документе не сохранён источник событий обучения. Его полнота не подтверждена; события не созданы из текущего состояния учётки. Документ не считается пустой историей обучения.",
  "unresolved-journal-area": "Учебная область истории не подтверждена справочниками каждого источника или различается между архивом и браузером. Ключ не разделялся на предполагаемые ID; события не объединены.",
  "unresolved-notification-source": "Постоянный ID или явный получатель уведомления не подтверждены. Учётки проверяются отдельно в архиве и браузере; роль не заменяет ID, записи и получатели не подставляются.",
};
const SOURCE_LABELS = { archive: "Архив", browser: "Этот браузер" };

export default function RecordComparisonReview<Field extends string>({ review, fieldLabels, title, recordName, documentName, documentsCountLabel, description, noChanges, unavailable, listLabel, skippedLabel }: Props<Field>) {
  const { counts } = review;
  if (!counts.documents) return null;
  const descriptions = new Map(review.differences.map((item) => [getBackupDifferenceKey(item), item.fields.length ? `Изменены поля: ${item.fields.map((field) => fieldLabels[field]).join(", ")}.` : ""]));
  const skipped: BackupDifference[] = review.uncompared.map((item) => ({ kind: "schema", area: SOURCE_LABELS[item.source], id: item.key }));
  const reasons = new Map(skipped.map((item, index) => [getBackupDifferenceKey(item), REASONS[review.uncompared[index].reason]]));
  return <details className={styles.details}>
    <summary>{title} · {documentsCountLabel} {counts.documents}{counts.uncheckedDocuments > 0 ? ` · не сравнено ${counts.uncheckedDocuments}` : ""}</summary>
    <div>
      <p className={styles.hint}>Сравнено {documentsCountLabel}: {counts.comparedDocuments} из {counts.documents}. {description}</p>
      <dl className={styles.statistics}>
        <div><dt>Совпадают {recordName.toLocaleLowerCase("ru-RU")}</dt><dd>{counts.same}</dd></div>
        <div><dt>{recordName} только в архиве</dt><dd>{counts.new}</dd></div>
        <div><dt>{recordName} отличаются</dt><dd>{counts.different}</dd></div>
        <div><dt>{recordName} только в браузере</dt><dd>{counts.currentOnly}</dd></div>
        <div><dt>{documentName} не сравнены</dt><dd>{counts.uncheckedDocuments}</dd></div>
      </dl>
      <p className={styles.hint}>Записи сопоставляются по точному ключу документа и ID. Названия и значения полей в отчёт не включаются. Различие не выбирает версию для восстановления и не подтверждает владельца или права.</p>
      {review.differences.length ? <DifferenceReview differences={review.differences} ariaLabel={listLabel} describeDifference={(item) => descriptions.get(getBackupDifferenceKey(item)) ?? ""} /> : <p className={styles.hint}>{counts.comparedDocuments ? noChanges : unavailable}</p>}
      {skipped.length > 0 && <details className={styles.details}><summary>Несравнённые {documentName.toLocaleLowerCase("ru-RU")} · {counts.uncheckedDocuments}</summary><div><p className={styles.hint}>Для одного документа могут быть отдельные замечания об архиве и браузере.</p><DifferenceReview differences={skipped} ariaLabel={skippedLabel} describeDifference={(item) => reasons.get(getBackupDifferenceKey(item)) ?? ""} /></div></details>}
    </div>
  </details>;
}
