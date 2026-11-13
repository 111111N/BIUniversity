import type { AssessmentDraft, AssessmentSnapshot } from "../../domain/assessmentTypes";
import { assessmentPeriodLabel } from "../../domain/assessmentPeriods";

export const reviewAssessmentPeriodSelection = (draft: AssessmentDraft, yearId: string, periods: AssessmentSnapshot["academicPeriods"]) => {
  if (!periods || periods.error) throw new Error(periods?.error ?? "Учебные периоды недоступны. Ввод сохранён.");
  const term = periods.terms.find(row => row.id === draft.academicPeriod?.termId), year = periods.years.find(row => row.id === yearId);
  if (yearId && !year || draft.academicPeriod && (!term || !year || term.yearId !== year.id)) return {
    draft: { ...draft, period: "", academicPeriod: undefined }, yearId: year ? yearId : "",
    warning: "Выбранный учебный период недоступен. Остальной ввод сохранён; выберите год и семестр заново.",
  };
  return { yearId, warning: "", draft: term && year ? { ...draft, period: assessmentPeriodLabel({ catalogRevision: periods.revision, year, term }), academicPeriod: { termId: term.id, expectedRevision: periods.revision } } : draft };
};
