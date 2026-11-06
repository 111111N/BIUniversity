import type { BackupMaterialAreaComparison, BackupMaterialAreaSource } from "../../domain/backupMaterialArea";
import styles from "./index.module.scss";

const RELATIONS = { same: "совпадают", different: "различаются", unresolved: "не подтверждены" };
const CATALOGS = { user: "учётных записей", subject: "дисциплин", group: "дисциплин или групп" };
const MATCHED = { user: "Личная область связана с учёткой источника.", subject: "Дисциплина найдена в каталоге источника.", group: "Пара дисциплина–группа однозначно найдена в каталогах источника." };
const describe = (source: BackupMaterialAreaSource) => {
  switch (source.status) {
    case "matched": return MATCHED[source.kind];
    case "unavailable-catalog": return `Не прочитан справочник ${CATALOGS[source.kind]} этого источника.`;
    case "unresolved-reference": return "Нужные ID не найдены в справочниках этого источника.";
    case "ambiguous-area": return "Для области найдены несколько пар дисциплины и группы.";
    case "legacy": return "У старого общего материала не сохранена область с ID.";
    case "unsupported-scope": return "Сохранённая область не поддерживается или неоднозначно закодирована.";
    case "unavailable-record": return "Запись или схема не позволяют проверить область.";
  }
};
export default function MaterialAreaReview({ review }: { review: BackupMaterialAreaComparison }) {
  return <details className={styles.fileAreaReview}>
    <summary>Области материала · {RELATIONS[review.relation]}</summary>
    <div><dl><div><dt>Архив</dt><dd>{describe(review.archive)}</dd></div><div><dt>Этот браузер</dt><dd>{describe(review.browser)}</dd></div></dl>
      <p>Происхождение, права и связи итогового набора ещё требуют проверки. Эта сводка не разрешает выбор версии или восстановление файла.</p>
    </div>
  </details>;
}
