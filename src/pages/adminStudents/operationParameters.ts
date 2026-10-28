import { MAX_STUDENT_BULK_TARGETS, getStudentTransferGroupProblem } from "../../domain/studentBulk";
import type { StudentBulkAction } from "../../domain/studentBulkReceipt";
import { getEducationDetailsErrors, type EducationEventDetails, type EducationEventField } from "../../domain/studentEducationEvent";
import type { RegistryGroup } from "../../domain/studentRegistry";

export interface StudentOperationParameters {
  kind: StudentBulkAction["kind"];
  targetGroupId: string;
  education: EducationEventDetails;
}
export interface StudentOperationProblem { field: "targetGroup" | EducationEventField; message: string }
export const getStudentOperationProblems = (parameters: StudentOperationParameters, groups: RegistryGroup[], now: string): StudentOperationProblem[] => {
  const groupProblem = parameters.kind === "transfer" ? getStudentTransferGroupProblem(groups.find((group) => group.id === parameters.targetGroupId)) : "";
  return [...(groupProblem ? [{ field: "targetGroup" as const, message: groupProblem }] : []), ...getEducationDetailsErrors(parameters.education, now)];
};
export const getStudentOperationBlockReason = ({ busy, unavailable, actorAvailable, count }: { busy: boolean; unavailable: boolean; actorAvailable: boolean; count: number }) => {
  if (busy) return "Проверяем выбранных студентов…";
  if (unavailable) return "Сначала восстановите чтение учёток и групп кнопкой «Повторить чтение». Введённые параметры сохранятся.";
  if (!actorAvailable) return "Учётная запись активного настройщика недоступна. Обновите данные перед проверкой.";
  if (!Number.isSafeInteger(count) || count < 1) return "Вернитесь к реестру и выберите студентов для действия.";
  if (count > MAX_STUDENT_BULK_TARGETS) return `Выбрано больше ${MAX_STUDENT_BULK_TARGETS} студентов. Уменьшите выбор в реестре.`;
  return "";
};
