import type { EducationEventDetails } from "../../domain/studentEducationEvent";

export const hasEducationDetailsChanges = (value: EducationEventDetails, baseline: EducationEventDetails) => value.effectiveDate !== baseline.effectiveDate
  || value.basis !== baseline.basis || (value.documentNumber ?? "") !== (baseline.documentNumber ?? "") || (value.documentDate ?? "") !== (baseline.documentDate ?? "");
