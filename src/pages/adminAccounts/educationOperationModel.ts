import { getStudentGroupId, type AccountDraft, type PortalAccount } from "../../domain/accounts";
import { isGroupActive } from "../../domain/groupCatalog";
import type { RegistryGroup } from "../../domain/studentRegistry";
import { educationContinuationError, normalizeEducationDetails, type EducationEventDetails, type StudentEducationEvent } from "../../domain/studentEducationEvent";

export type EducationOperation = "transfer" | "graduate" | "withdraw" | "reinstate";
export const EDUCATION_OPERATIONS = {
  transfer: { label: "Перевести в другую группу", hint: "Изменить группу, сохранив состояние «Учится».", success: "Перевод сохранён." },
  graduate: { label: "Оформить выпуск", hint: "Сохранить дату и основание выпуска.", success: "Выпуск оформлен." },
  withdraw: { label: "Оформить отчисление", hint: "Сохранить дату и основание отчисления.", success: "Отчисление оформлено." },
  reinstate: { label: "Возобновить обучение", hint: "Вернуть состояние «Учится» в текущей группе.", success: "Возобновление обучения сохранено." },
} satisfies Record<EducationOperation, { label: string; hint: string; success: string }>;

export const getEducationOperations = (account: PortalAccount): EducationOperation[] => {
  if (account.role !== "student") return [];
  const state = account.enrollmentStatus ?? "studying";
  return [
    ...(state === "studying" ? ["transfer" as const] : ["reinstate" as const]),
    ...(state !== "graduated" ? ["graduate" as const] : []),
    ...(state !== "withdrawn" ? ["withdraw" as const] : []),
  ];
};

export const prepareEducationOperation = (account: PortalAccount, draft: AccountDraft, operation: EducationOperation | null): AccountDraft => ({
  ...draft,
  studentGroupId: account.studentGroupId,
  memberships: account.memberships.map((entry) => ({ ...entry, groupIds: [...entry.groupIds] })),
  studentCampus: undefined,
  enrollmentStatus: operation === "graduate" ? "graduated" : operation === "withdraw" ? "withdrawn" : operation === "reinstate" ? "studying" : account.enrollmentStatus,
});

export const getEducationOperationRestriction = (account: PortalAccount, operation: EducationOperation, groups: RegistryGroup[]) => {
  if (!getEducationOperations(account).includes(operation)) return "Выберите действие, соответствующее текущему состоянию обучения.";
  const group = groups.find((entry) => entry.id === getStudentGroupId(account));
  if (!group) return "Текущая учебная группа недоступна. Проверьте сведения о группе.";
  if (operation === "reinstate" && !isGroupActive(group)) return "Группа в архиве. Сначала восстановите группу, затем возобновите обучение. Перевод оформляется после возобновления отдельным событием.";
  return "";
};

export const getEducationOperationProblem = (
  account: PortalAccount,
  draft: AccountDraft,
  operation: EducationOperation | null,
  education: EducationEventDetails,
  events: StudentEducationEvent[],
  groups: RegistryGroup[],
  now: string,
) => {
  if (!operation) return "Выберите действие с обучением.";
  const restriction = getEducationOperationRestriction(account, operation, groups);
  if (restriction) return restriction;
  const previousGroup = groups.find((group) => group.id === getStudentGroupId(account))!;
  const nextGroup = getStudentGroupId(draft);
  const state = account.enrollmentStatus ?? "studying";
  const expectedState = operation === "transfer" ? state : operation === "graduate" ? "graduated" : operation === "withdraw" ? "withdrawn" : "studying";
  if ((draft.enrollmentStatus ?? "studying") !== expectedState || (operation !== "transfer" && nextGroup !== previousGroup.id)) return "Оформите перевод и изменение состояния отдельными действиями.";
  if (operation === "transfer" && (!nextGroup || nextGroup === previousGroup.id)) return "Выберите другую учебную группу для перевода.";
  if (operation === "transfer" && !groups.some((group) => group.id === nextGroup && isGroupActive(group))) return "Выберите действующую учебную группу для перевода.";
  try {
    const normalized = normalizeEducationDetails(education, now);
    return educationContinuationError(events, { groupId: previousGroup.id, groupName: previousGroup.name, enrollment: state }, normalized.effectiveDate);
  } catch (error) {
    if (error instanceof Error) return error.message;
    console.error("Не удалось проверить подготовку события обучения:", error);
    return "Не удалось проверить событие. Проверьте дату и основание.";
  }
};
