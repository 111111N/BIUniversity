import type { AcademicPeriodsSnapshot } from "../../data/academicPeriodsStore";
import type { AcademicPeriodDraft, AcademicYear } from "../../domain/academicPeriods";

export interface PeriodEditor {
  entity: "year" | "term"; id?: string; yearId?: string;
  base: AcademicPeriodsSnapshot; source?: AcademicYear; initial: AcademicPeriodDraft; draft: AcademicPeriodDraft;
}
/** An unrelated catalog change may be reviewed; a changed target must be reopened explicitly. */
export const refreshPeriodEditor = (editor: PeriodEditor, latest: AcademicPeriodsSnapshot): PeriodEditor => {
  const record = editor.entity === "year" ? latest.years.find(row => row.id === editor.id) : latest.terms.find(row => row.id === editor.id);
  const source = editor.source;
  if ((editor.id && (!record || !source || record.id !== source.id || record.revision !== source.revision || record.name !== source.name || record.startsOn !== source.startsOn || record.endsOn !== source.endsOn))
    || (editor.entity === "term" && (!latest.years.some(row => row.id === editor.yearId) || (record && "yearId" in record && record.yearId !== editor.yearId)))) {
    throw new Error("Сам период или его учебный год изменён. Ввод сохранён; откройте актуальную карточку заново перед изменением.");
  }
  return { ...editor, base: latest };
};
