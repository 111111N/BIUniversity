import { ACCOUNT_ROLE_LABELS, getStudentGroupId, isAccountActive, type AccountDraft, type PortalAccount } from "../../domain/accounts";
import { STUDENT_ENROLLMENT_LABELS } from "../../domain/studentEnrollment";

export type AccountAction = "role" | "education" | "block" | "activate" | "issue";
export interface AccountActionReview { title: string; confirmLabel: string; changes: { label: string; before: string; after: string }[]; notes: string[]; validationMessage: string }
export const getAccountActionReview = (action: AccountAction, account: PortalAccount, draft: AccountDraft, groups: { id: string; name: string }[], studentNumber?: string): AccountActionReview => {
  const result: AccountActionReview = { title: "Проверить изменения", confirmLabel: "Сохранить изменения", changes: [], notes: [], validationMessage: "" };
  const groupLabel = (id: string | undefined) => id ? groups.find((group) => group.id === id)?.name ?? `Группа недоступна (${id})` : "Не выбрана";
  if (action === "role") {
    result.title = "Изменить тип учётной записи?"; result.confirmLabel = "Изменить тип";
    result.changes.push({ label: "Тип учётной записи", before: ACCOUNT_ROLE_LABELS[account.role], after: ACCOUNT_ROLE_LABELS[draft.role] });
    if (draft.role === "student" && account.role !== "student") {
      result.changes.push({ label: "Учебная группа", before: "Не применяется", after: groupLabel(getStudentGroupId(draft)) });
      if (!getStudentGroupId(draft)) result.validationMessage = "Выберите учебную группу студента в форме.";
      if (!account.studentRecord) result.changes.push({ label: "Номер зачетки", before: "Не выдан", after: studentNumber ?? "Номер ещё не получен" });
    }
    result.notes.push(draft.role === "configurator" ? "Пользователь получит управление учётными записями, справочниками и расписанием." : draft.role === "teacher" ? "Учебные дисциплины и группы преподавателя назначаются отдельно." : "Данные учебного кабинета определяются группой студента.");
    if (account.role === "teacher" && draft.role !== "teacher" && account.memberships.length) result.notes.push("Все назначения преподавателя будут сняты при смене типа.");
    if (!isAccountActive(account)) result.notes.push("Вход останется заблокирован: смена типа не восстанавливает доступ к кабинету.");
    result.notes.push("Права изменятся после подтверждения. Выданная зачетка, учебные результаты и история сохранятся.");
  } else if (action === "education") {
    const previousGroup = getStudentGroupId(account); const nextGroup = getStudentGroupId(draft);
    const previousState = account.enrollmentStatus ?? "studying"; const nextState = draft.enrollmentStatus ?? "studying";
    if (previousGroup !== nextGroup) result.changes.push({ label: "Учебная группа", before: groupLabel(previousGroup), after: groupLabel(nextGroup) });
    if (previousState !== nextState) result.changes.push({ label: "Состояние обучения", before: STUDENT_ENROLLMENT_LABELS[previousState], after: STUDENT_ENROLLMENT_LABELS[nextState] });
    const operation = previousGroup !== nextGroup ? "перевод" : nextState === "graduated" ? "выпуск" : nextState === "withdrawn" ? "отчисление" : "возобновление обучения";
    result.title = `Подтвердить ${operation}?`; result.confirmLabel = `Подтвердить ${operation}`;
    if (previousGroup !== nextGroup && previousState !== nextState) result.validationMessage = "Перевод и изменение состояния обучения оформляются отдельными событиями. Вернитесь к форме и выберите одно действие.";
    result.notes.push(previousGroup !== nextGroup ? "Данные учебного кабинета будут связаны с новой группой. Прежние результаты сохранятся в истории." : "Изменится состояние обучения. Группа, выданная зачетка и результаты сохранятся.");
    result.notes.push("Доступ к кабинету не меняется: он настраивается отдельно во вкладке «Доступ».");
  } else if (action === "issue") {
    result.title = "Выдать номер зачетки?"; result.confirmLabel = "Выдать номер";
    result.changes.push({ label: "Номер зачетки", before: "Не выдан", after: studentNumber ?? "Номер ещё не получен" });
    result.notes.push("Номер станет постоянным. Изменить его после выдачи нельзя.");
  } else {
    const blocking = action === "block";
    result.title = blocking ? "Заблокировать учётную запись?" : "Восстановить доступ?"; result.confirmLabel = blocking ? "Заблокировать" : "Восстановить доступ";
    result.changes.push({ label: "Доступ к кабинету", before: blocking ? "Открыт" : "Заблокирован", after: blocking ? "Заблокирован" : "Открыт" });
    result.notes.push(blocking ? "Вход в кабинет будет закрыт. Тип учётки, состояние обучения и история сохранятся." : "Вход в кабинет будет открыт. Тип учётки, состояние обучения и назначения не изменятся.");
    if (blocking && account.role === "teacher") result.notes.push("Преподаватель станет недоступен для выбора в новых парах. Опубликованные пары не отменяются автоматически — проверьте расписание.");
  }
  return result;
};
