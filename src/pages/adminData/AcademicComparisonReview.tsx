import { ACADEMIC_COMPARISON_LABELS, ACADEMIC_COMPARISON_SECTIONS, getUncheckedAcademicDocuments, type AcademicComparisonSection, type BackupAcademicComparison } from "../../domain/backupAcademicComparison";
import RecordComparisonReview from "./RecordComparisonReview";
import styles from "./index.module.scss";
import type { BackupInspection } from "../../data/localBackupInspectionService";
import PeriodSelectionReview from "./PeriodSelectionReview";

const labels: Record<AcademicComparisonSection, string> = { years: "Учебные годы", terms: "Семестры", periodHistory: "История общих учебных периодов", programs: "Учебные программы", forms: "Формы обучения", directoryHistory: "История программ и форм", plans: "Версии учебных планов", bindings: "Назначения планов по ID группы", curriculumHistory: "История планов и назначений", calendars: "Календари групп", calendarHistory: "История календарей групп", teaching: "Назначения преподавателей по типам", teachingHistory: "История назначений преподавателей" };
export default function AcademicComparisonReview({ review, inspection }: { review: BackupAcademicComparison; inspection: BackupInspection }) {
  const documents = review.years.counts.documents + review.programs.counts.documents + review.plans.counts.documents + review.calendars.counts.documents + review.teaching.counts.documents;
  if (!documents) return null;
  const unchecked = getUncheckedAcademicDocuments(review);
  return <details className={styles.details}><summary>Учебные справочники и история по ID · документов {documents}{unchecked ? ` · не сравнено ${unchecked}` : ""}</summary><div className={styles.catalogComparisonBody}>
    <p className={styles.hint}>Сравниваются полные сохранённые карточки и события. Снимки программ, дисциплин, семестров, часы и назначения не заполняются данными другого источника. Ревизии документов, порядок массивов и их прочие свойства остаются в общем сравнении. Выбор версии для отдельной записи не подтверждает совместимость итоговой истории, учебных связей и полномочий.</p>
    {review.years.counts.documents > 0 && <PeriodSelectionReview inspection={inspection} />}
    {ACADEMIC_COMPARISON_SECTIONS.map(section => <RecordComparisonReview key={section} review={review[section]} fieldLabels={ACADEMIC_COMPARISON_LABELS} title={labels[section]} recordName="Записи" documentName="Документы" documentsCountLabel="документов" description={section === "bindings" ? "Ключ назначения — сохранённый ID группы; планы и семестры не подбираются по названию. У одной группы одно текущее назначение плана." : section.endsWith("History") ? "События сравниваются по собственному ID, включая полные снимки до/после. Отсутствующая история не достраивается из текущего состояния." : "Карточки сравниваются по постоянному ID. Вложенные списки и снимки входят в содержимое записи целиком; одинаковое количество строк не скрывает их различия."} noChanges="В сравнимых документах различий записей не найдено." unavailable="Нет документов, для которых удалось прочитать полную схему и историю." listLabel={labels[section]} skippedLabel="Несравнённые учебные документы" />)}
  </div></details>;
}
